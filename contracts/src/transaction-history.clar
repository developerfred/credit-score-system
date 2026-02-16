(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INVALID_TRANSACTION (err u101))
(define-constant ERR_NOT_FOUND (err u102))
(define-constant ERR_DUPLICATE (err u103))
(define-constant ERR_CONTRACT_NOT_INITIALIZED (err u107))
(define-constant ERR_DEPENDENCY_NOT_INITIALIZED (err u108))

(define-constant CREDIT_SCORE_CONTRACT .credit-score)
(define-constant LOAN_MANAGER_CONTRACT .loan-manager)

(define-constant TX_TYPE_SWAP "swap")
(define-constant TX_TYPE_LEND "lend")
(define-constant TX_TYPE_BORROW "borrow")
(define-constant TX_TYPE_REPAY "repay")
(define-constant TX_TYPE_STAKE "stake")
(define-constant TX_TYPE_PROVIDE_LIQUIDITY "provide_liquidity")
(define-constant TX_TYPE_GOVERNANCE "governance")

(define-map transactions
  { tx-id: uint }
  {
    user: principal,
    tx-type: (string-ascii 32),
    amount: uint,
    counterparty: (optional principal),
    protocol: (string-ascii 64),
    timestamp: uint,
    block-height: uint,
    metadata: (optional (string-ascii 256))
  }
)

(define-map user-transactions
  { user: principal }
  { tx-ids: (list 1000 uint) }
)

(define-map user-stats
  { user: principal }
  {
    total-transactions: uint,
    total-volume: uint,
    first-tx-block: uint,
    last-tx-block: uint,
    unique-protocols: uint,
    successful-txs: uint,
    failed-txs: uint
  }
)

(define-map protocol-stats
  { protocol: (string-ascii 64) }
  {
    total-transactions: uint,
    total-volume: uint,
    unique-users: uint
  }
)

(define-map authorized-recorders
  { recorder: principal }
  { authorized: bool }
)

(define-data-var tx-counter uint u0)
(define-data-var contract-initialized bool false)

(define-public (initialize)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (not (var-get contract-initialized)) ERR_CONTRACT_NOT_INITIALIZED)
    (map-set authorized-recorders { recorder: CONTRACT_OWNER } { authorized: true })
    (map-set authorized-recorders { recorder: LOAN_MANAGER_CONTRACT } { authorized: true })
    (var-set contract-initialized true)
    (ok true)
  )
)

(define-read-only (is-initialized)
  (var-get contract-initialized)
)

(define-read-only (is-credit-score-initialized)
  (contract-call? CREDIT_SCORE_CONTRACT is-initialized)
)

(define-read-only (get-transaction (tx-id uint))
  (map-get? transactions { tx-id: tx-id })
)

(define-read-only (get-user-transactions (user principal))
  (default-to { tx-ids: (list ) } (map-get? user-transactions { user: user }))
)

(define-read-only (get-user-stats (user principal))
  (default-to 
    { 
      total-transactions: u0, 
      total-volume: u0, 
      first-tx-block: u0, 
      last-tx-block: u0,
      unique-protocols: u0,
      successful-txs: u0,
      failed-txs: u0
    }
    (map-get? user-stats { user: user })
  )
)

(define-read-only (get-protocol-stats (protocol (string-ascii 64)))
  (default-to 
    { total-transactions: u0, total-volume: u0, unique-users: u0 }
    (map-get? protocol-stats { protocol: protocol })
  )
)

(define-read-only (get-tx-counter)
  (var-get tx-counter)
)

(define-read-only (is-authorized-recorder (recorder principal))
  (default-to false (get authorized (map-get? authorized-recorders { recorder: recorder })))
)

(define-read-only (calculate-transaction-score (user principal))
  (let ((stats (get-user-stats user)))
    (let (
      (age-factor (if (> (get last-tx-block stats) (get first-tx-block stats))
        (/ (* (- (get last-tx-block stats) (get first-tx-block stats)) u100) block-height)
        u0
      ))
      (volume-factor (if (> (get total-volume stats) u0)
        (/ (get total-volume stats) u100000000)
        u0
      ))
      (frequency-factor (get total-transactions stats))
      (success-rate (if (> (get total-transactions stats) u0)
        (/ (* (get successful-txs stats) u1000) (get total-transactions stats))
        u0
      ))
    )
      (+ 
        (* age-factor u2)
        (* volume-factor u3)
        (* frequency-factor u1)
        (* success-rate u4)
      )
    )
  )
)

(define-public (record-transaction
  (user principal)
  (tx-type (string-ascii 32))
  (amount uint)
  (counterparty (optional principal))
  (protocol (string-ascii 64))
  (metadata (optional (string-ascii 256)))
)
  (let ((recorder tx-sender))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    ;; Fix: Use match instead of unwrap-panic
    (match (is-credit-score-initialized)
      (ok true) true
      (ok false) (return ERR_DEPENDENCY_NOT_INITIALIZED)
      (err e) (return ERR_DEPENDENCY_NOT_INITIALIZED)
    )
    (asserts! (is-authorized-recorder recorder) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_TRANSACTION)
    (let ((tx-id (+ (var-get tx-counter) u1)))
      (var-set tx-counter tx-id)
      (map-set transactions
        { tx-id: tx-id }
        {
          user: user,
          tx-type: tx-type,
          amount: amount,
          counterparty: counterparty,
          protocol: protocol,
          timestamp: block-height,
          block-height: block-height,
          metadata: metadata
        }
      )
      (let ((current-txs (get tx-ids (get-user-transactions user))))
        (map-set user-transactions
          { user: user }
          { tx-ids: (unwrap! (as-max-len? (append current-txs tx-id) u1000) ERR_INVALID_TRANSACTION) }
        )
      )
      (update-user-stats user amount protocol)
      (update-protocol-stats protocol amount)
      (try! (update-credit-score user))
      (ok tx-id)
    )
  )
)

(define-public (record-self-transaction
  (tx-type (string-ascii 32))
  (amount uint)
  (protocol (string-ascii 64))
  (metadata (optional (string-ascii 256)))
)
  (record-transaction tx-sender tx-type amount none protocol metadata)
)

(define-public (batch-record-transactions
  (users (list 10 principal))
  (amounts (list 10 uint))
  (protocol (string-ascii 64))
)
  (let ((recorder tx-sender))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-authorized-recorder recorder) ERR_UNAUTHORIZED)
    (map record-single-batch users amounts protocol)
    (ok true)
  )
)

(define-private (record-single-batch (user principal) (amount uint) (protocol (string-ascii 64)))
  (record-transaction user "batch_operation" amount none protocol none)
)

(define-private (update-user-stats (user principal) (amount uint) (protocol (string-ascii 64)))
  (let ((current-stats (get-user-stats user)))
    (map-set user-stats
      { user: user }
      {
        total-transactions: (+ (get total-transactions current-stats) u1),
        total-volume: (+ (get total-volume current-stats) amount),
        first-tx-block: (if (is-eq (get first-tx-block current-stats) u0)
          block-height
          (get first-tx-block current-stats)
        ),
        last-tx-block: block-height,
        unique-protocols: (+ (get unique-protocols current-stats) u1),
        successful-txs: (+ (get successful-txs current-stats) u1),
        failed-txs: (get failed-txs current-stats)
      }
    )
  )
)

(define-private (update-protocol-stats (protocol (string-ascii 64)) (amount uint))
  (let ((current-stats (get-protocol-stats protocol)))
    (map-set protocol-stats
      { protocol: protocol }
      {
        total-transactions: (+ (get total-transactions current-stats) u1),
        total-volume: (+ (get total-volume current-stats) amount),
        unique-users: (+ (get unique-users current-stats) u1)
      }
    )
  )
)

(define-private (update-credit-score (user principal))
  (let ((tx-score (calculate-transaction-score user)))
    ;; Fix: Use match instead of unwrap-panic
    (match (contract-call? CREDIT_SCORE_CONTRACT get-credit-score user)
      current-credit
      (let ((new-score (/ (+ (* current-credit u8) tx-score) u9)))
        (contract-call? CREDIT_SCORE_CONTRACT update-credit-score user 
          (if (> new-score u1000) u1000 new-score)
        )
      )
      error error
    )
  )
)

(define-public (authorize-recorder (recorder principal))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-set authorized-recorders { recorder: recorder } { authorized: true })
    (ok true)
  )
)

(define-public (revoke-recorder (recorder principal))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-delete authorized-recorders { recorder: recorder })
    (ok true)
  )
)

(define-public (record-failed-transaction (user principal) (protocol (string-ascii 64)))
  (let ((recorder tx-sender))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-authorized-recorder recorder) ERR_UNAUTHORIZED)
    (let ((current-stats (get-user-stats user)))
      (map-set user-stats
        { user: user }
        (merge current-stats { failed-txs: (+ (get failed-txs current-stats) u1) })
      )
    )
    ;; Fix: Use match instead of unwrap-panic and prevent underflow
    (match (contract-call? CREDIT_SCORE_CONTRACT get-credit-score user)
      current-credit
      (let ((new-score (if (> current-credit u10) (- current-credit u5) current-credit)))
        (try! (contract-call? CREDIT_SCORE_CONTRACT update-credit-score user new-score))
        (ok true)
      )
      error error
    )
  )
)
