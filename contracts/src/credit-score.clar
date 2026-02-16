(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INVALID_SCORE (err u101))
(define-constant ERR_USER_NOT_FOUND (err u102))
(define-constant ERR_ALREADY_INITIALIZED (err u103))
(define-constant ERR_CONTRACT_NOT_INITIALIZED (err u107))
(define-constant ERR_PENDING_ACTION_NOT_FOUND (err u109))
(define-constant ERR_TIMELOCK_NOT_EXPIRED (err u110))
(define-constant MIN_SCORE u0)
(define-constant MAX_SCORE u1000)
(define-constant INITIAL_SCORE u500)
(define-constant HISTORY_LIMIT u100)
(define-constant TIMELOCK_BLOCKS u1440)

(define-map user-credit-scores
  { user: principal }
  {
    score: uint,
    history: (list 100 uint),
    last-updated: uint,
    transaction-count: uint
  }
)

(define-map user-credit-scores-archive
  { user: principal, archive-index: uint }
  { history: (list 100 uint) }
)

(define-map user-archive-index
  { user: principal }
  { current-index: uint }
)

(define-map authorized-updaters
  { updater: principal }
  { authorized: bool }
)

(define-map score-factors
  { factor: (string-ascii 32) }
  { weight: uint }
)

(define-map pending-admin-actions
  { action-id: uint }
  {
    action-type: (string-ascii 32),
    target: principal,
    value: uint,
    proposed-at: uint,
    execute-after: uint
  }
)

(define-data-var action-counter uint u0)
(define-data-var contract-initialized bool false)

(define-public (initialize)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (not (var-get contract-initialized)) ERR_ALREADY_INITIALIZED)
    (map-set score-factors { factor: "payment_history" } { weight: u35 })
    (map-set score-factors { factor: "transaction_volume" } { weight: u25 })
    (map-set score-factors { factor: "account_age" } { weight: u20 })
    (map-set score-factors { factor: "credit_mix" } { weight: u10 })
    (map-set score-factors { factor: "recent_inquiries" } { weight: u10 })
    (map-set authorized-updaters { updater: CONTRACT_OWNER } { authorized: true })
    (var-set contract-initialized true)
    (ok true)
  )
)

(define-read-only (is-initialized)
  (var-get contract-initialized)
)

(define-read-only (get-credit-score (user principal))
  (match (map-get? user-credit-scores { user: user })
    score-data (ok (get score score-data))
    (ok INITIAL_SCORE)
  )
)

(define-read-only (get-user-credit-data (user principal))
  (map-get? user-credit-scores { user: user })
)

(define-read-only (get-score-history (user principal))
  (match (map-get? user-credit-scores { user: user })
    score-data (ok (get history score-data))
    (ok (list ))
  )
)

(define-read-only (get-full-history (user principal))
  (let (
    (current-data (map-get? user-credit-scores { user: user }))
    (archive-index (default-to { current-index: u0 } (map-get? user-archive-index { user: user })))
    )
    (match current-data
      data 
      (ok {
        current-history: (get history data),
        archive-count: (get current-index archive-index)
      })
      (ok { current-history: (list ), archive-count: u0 })
    )
  )
)

(define-read-only (get-archived-history (user principal) (index uint))
  (map-get? user-credit-scores-archive { user: user, archive-index: index })
)

(define-read-only (is-authorized-updater (updater principal))
  (default-to false (get authorized (map-get? authorized-updaters { updater: updater })))
)

(define-read-only (get-score-factor (factor (string-ascii 32)))
  (map-get? score-factors { factor: factor })
)

(define-read-only (get-pending-action (action-id uint))
  (map-get? pending-admin-actions { action-id: action-id })
)

(define-public (initialize-user-score)
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (let ((existing-data (map-get? user-credit-scores { user: tx-sender })))
      (asserts! (is-none existing-data) ERR_ALREADY_INITIALIZED)
      (map-set user-credit-scores
        { user: tx-sender }
        {
          score: INITIAL_SCORE,
          history: (list INITIAL_SCORE),
          last-updated: block-height,
          transaction-count: u0
        }
      )
      (ok INITIAL_SCORE)
    )
  )
)

(define-private (archive-history-if-needed (user principal) (current-history (list 100 uint)))
  (if (>= (len current-history) HISTORY_LIMIT)
    (let (
      (archive-data (default-to { current-index: u0 } (map-get? user-archive-index { user: user })))
      (new-index (+ (get current-index archive-data) u1))
      )
      (map-set user-credit-scores-archive 
        { user: user, archive-index: (get current-index archive-data) }
        { history: current-history }
      )
      (map-set user-archive-index { user: user } { current-index: new-index })
      (list )
    )
    current-history
  )
)

(define-public (update-credit-score (user principal) (new-score uint))
  (let ((updater tx-sender))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-authorized-updater updater) ERR_UNAUTHORIZED)
    (asserts! (and (>= new-score MIN_SCORE) (<= new-score MAX_SCORE)) ERR_INVALID_SCORE)
    (match (map-get? user-credit-scores { user: user })
      existing-data
      (let (
        (current-history (get history existing-data))
        (processed-history (archive-history-if-needed user current-history))
        )
        (map-set user-credit-scores
          { user: user }
          {
            score: new-score,
            history: (unwrap! (as-max-len? (append processed-history new-score) HISTORY_LIMIT) ERR_INVALID_SCORE),
            last-updated: block-height,
            transaction-count: (+ (get transaction-count existing-data) u1)
          }
        )
        (ok new-score)
      )
      ERR_USER_NOT_FOUND
    )
  )
)

(define-public (calculate-and-update-score 
  (user principal)
  (payment-history uint)
  (transaction-volume uint)
  (account-age uint)
  (credit-mix uint)
  (recent-inquiries uint)
)
  (let ((updater tx-sender))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-authorized-updater updater) ERR_UNAUTHORIZED)
    (let (
      (payment-weight (default-to u35 (get weight (map-get? score-factors { factor: "payment_history" }))))
      (volume-weight (default-to u25 (get weight (map-get? score-factors { factor: "transaction_volume" }))))
      (age-weight (default-to u20 (get weight (map-get? score-factors { factor: "account_age" }))))
      (mix-weight (default-to u10 (get weight (map-get? score-factors { factor: "credit_mix" }))))
      (inquiry-weight (default-to u10 (get weight (map-get? score-factors { factor: "recent_inquiries" }))))
    )
      (let (
        (calculated-score (+ 
          (* payment-history payment-weight)
          (* transaction-volume volume-weight)
          (* account-age age-weight)
          (* credit-mix mix-weight)
          (* recent-inquiries inquiry-weight)
        ))
      )
        (let ((final-score (if (> calculated-score MAX_SCORE) MAX_SCORE calculated-score)))
          (update-credit-score user final-score)
        )
      )
    )
  )
)

(define-public (authorize-updater (updater principal))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-set authorized-updaters { updater: updater } { authorized: true })
    (ok true)
  )
)

(define-public (revoke-updater (updater principal))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-delete authorized-updaters { updater: updater })
    (ok true)
  )
)

(define-public (update-score-factor (factor (string-ascii 32)) (weight uint))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (<= weight u100) ERR_INVALID_SCORE)
    (map-set score-factors { factor: factor } { weight: weight })
    (ok true)
  )
)

(define-read-only (get-credit-tier (user principal))
  (match (get-credit-score user)
    score (ok (if (>= score u800)
      u4
      (if (>= score u700)
        u3
        (if (>= score u600)
          u2
          (if (>= score u500)
            u1
            u0
          )
        )
      )
    ))
    error error
  )
)

(define-read-only (get-interest-rate (user principal))
  (match (get-credit-tier user)
    tier (ok (match tier
      u4 u500
      u3 u800
      u2 u1200
      u1 u1800
      u2500
    ))
    error error
  )
)

(define-public (propose-score-update (user principal) (new-score uint))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (and (>= new-score MIN_SCORE) (<= new-score MAX_SCORE)) ERR_INVALID_SCORE)
    (let ((action-id (+ (var-get action-counter) u1)))
      (var-set action-counter action-id)
      (map-set pending-admin-actions
        { action-id: action-id }
        {
          action-type: "update-score",
          target: user,
          value: new-score,
          proposed-at: block-height,
          execute-after: (+ block-height TIMELOCK_BLOCKS)
        }
      )
      (ok action-id)
    )
  )
)

(define-public (execute-proposed-action (action-id uint))
  (let ((action (unwrap! (map-get? pending-admin-actions { action-id: action-id }) ERR_PENDING_ACTION_NOT_FOUND)))
    (asserts! (>= block-height (get execute-after action)) ERR_TIMELOCK_NOT_EXPIRED)
    (asserts! (is-eq (get action-type action) "update-score") ERR_INVALID_SCORE)
    (map-delete pending-admin-actions { action-id: action-id })
    (update-credit-score (get target action) (get value action))
  )
)

(define-public (cancel-proposed-action (action-id uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (let ((action (unwrap! (map-get? pending-admin-actions { action-id: action-id }) ERR_PENDING_ACTION_NOT_FOUND)))
      (map-delete pending-admin-actions { action-id: action-id })
      (ok true)
    )
  )
)
