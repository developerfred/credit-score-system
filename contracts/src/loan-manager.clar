(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INVALID_AMOUNT (err u101))
(define-constant ERR_INSUFFICIENT_CREDIT (err u102))
(define-constant ERR_LOAN_NOT_FOUND (err u103))
(define-constant ERR_INVALID_STATE (err u104))
(define-constant ERR_INSUFFICIENT_COLLATERAL (err u105))
(define-constant ERR_LOAN_EXPIRED (err u106))
(define-constant ERR_CONTRACT_NOT_INITIALIZED (err u107))
(define-constant ERR_DEPENDENCY_NOT_INITIALIZED (err u108))
(define-constant BLOCKS_PER_YEAR u2102400)
(define-constant STX_TO_USD_RATE u100)

(define-constant CREDIT_SCORE_CONTRACT .credit-score)

(define-map loans
  { loan-id: uint }
  {
    borrower: principal,
    lender: (optional principal),
    amount: uint,
    interest-rate: uint,
    collateral: uint,
    duration: uint,
    start-block: uint,
    status: (string-ascii 16),
    repaid-amount: uint,
    credit-score-at-time: uint
  }
)

(define-map user-loans
  { user: principal }
  { loan-ids: (list 50 uint) }
)

(define-map loan-counter
  { counter: bool }
  { value: uint }
)

(define-data-var contract-initialized bool false)

(define-public (initialize)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (not (var-get contract-initialized)) ERR_CONTRACT_NOT_INITIALIZED)
    (map-set loan-counter { counter: true } { value: u0 })
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

(define-read-only (get-loan (loan-id uint))
  (map-get? loans { loan-id: loan-id })
)

(define-read-only (get-user-loans (user principal))
  (default-to { loan-ids: (list ) } (map-get? user-loans { user: user }))
)

(define-read-only (get-loan-count)
  (default-to { value: u0 } (map-get? loan-counter { counter: true }))
)

(define-read-only (calculate-interest (loan-id uint))
  (match (map-get? loans { loan-id: loan-id })
    loan
    (let (
      (blocks-elapsed (- block-height (get start-block loan)))
      (rate-per-block (/ (get interest-rate loan) BLOCKS_PER_YEAR))
    )
      (ok (* (* (get amount loan) rate-per-block) blocks-elapsed))
    )
    ERR_LOAN_NOT_FOUND
  )
)

(define-read-only (get-total-due (loan-id uint))
  (match (get-loan loan-id)
    loan
    (match (calculate-interest loan-id)
      interest (ok (+ (get amount loan) interest))
      error error
    )
    ERR_LOAN_NOT_FOUND
  )
)

(define-read-only (get-max-loan-amount (user principal))
  (match (contract-call? CREDIT_SCORE_CONTRACT get-credit-tier user)
    credit-tier 
    (ok (match credit-tier
      u4 u10000000000
      u3 u5000000000
      u2 u2000000000
      u1 u1000000000
      u500000000
    ))
    error error
  )
)

(define-read-only (get-required-collateral (amount uint) (credit-score uint))
  (/ (* amount (- u1000 credit-score)) u1000)
)

(define-public (request-loan (amount uint) (duration uint) (collateral uint))
  (let ((borrower tx-sender))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (match (is-credit-score-initialized)
      (ok true) true
      (ok false) (return ERR_DEPENDENCY_NOT_INITIALIZED)
      (err e) (return ERR_DEPENDENCY_NOT_INITIALIZED)
    )
    (match (get-max-loan-amount borrower)
      (ok max-amount)
      (begin
        (asserts! (<= amount max-amount) ERR_INSUFFICIENT_CREDIT)
        (match (contract-call? CREDIT_SCORE_CONTRACT get-interest-rate borrower)
          (ok interest-rate)
          (match (contract-call? CREDIT_SCORE_CONTRACT get-credit-score borrower)
            (ok credit-score)
            (begin
              (asserts! (> amount u0) ERR_INVALID_AMOUNT)
              (asserts! (> duration u0) ERR_INVALID_AMOUNT)
              (let ((required-collateral (get-required-collateral amount credit-score)))
                (asserts! (>= collateral required-collateral) ERR_INSUFFICIENT_COLLATERAL)
              )
              (try! (stx-transfer? collateral borrower (as-contract tx-sender)))
              (let ((loan-id (+ (get value (get-loan-count)) u1)))
                (map-set loan-counter { counter: true } { value: loan-id })
                (map-set loans
                  { loan-id: loan-id }
                  {
                    borrower: borrower,
                    lender: none,
                    amount: amount,
                    interest-rate: interest-rate,
                    collateral: collateral,
                    duration: duration,
                    start-block: block-height,
                    status: "pending",
                    repaid-amount: u0,
                    credit-score-at-time: credit-score
                  }
                )
                (let ((current-loans (get loan-ids (get-user-loans borrower))))
                  (map-set user-loans
                    { user: borrower }
                    { loan-ids: (unwrap! (as-max-len? (append current-loans loan-id) u50) ERR_INVALID_STATE) }
                  )
                )
                (ok loan-id)
              )
            )
            error error
          )
          error error
        )
      )
      error error
    )
  )
)

(define-public (fund-loan (loan-id uint))
  (let (
    (lender tx-sender)
    (loan (unwrap! (get-loan loan-id) ERR_LOAN_NOT_FOUND))
    )
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq (get status loan) "pending") ERR_INVALID_STATE)
    (asserts! (not (is-eq lender (get borrower loan))) ERR_UNAUTHORIZED)
    (try! (stx-transfer? (get amount loan) lender (get borrower loan)))
    (map-set loans
      { loan-id: loan-id }
      (merge loan {
        lender: (some lender),
        status: "active",
        start-block: block-height
      })
    )
    (ok true)
  )
)

(define-public (repay-loan (loan-id uint) (payment uint))
  (let (
    (borrower tx-sender)
    (loan (unwrap! (get-loan loan-id) ERR_LOAN_NOT_FOUND))
    )
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq borrower (get borrower loan)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status loan) "active") ERR_INVALID_STATE)
    (let ((total-due (unwrap-panic (get-total-due loan-id))))
      (asserts! (<= (+ (get repaid-amount loan) payment) total-due) ERR_INVALID_AMOUNT)
      (try! (stx-transfer? payment borrower (unwrap! (get lender loan) ERR_INVALID_STATE)))
      (let ((new-repaid (+ (get repaid-amount loan) payment)))
        (if (>= new-repaid total-due)
          (begin
            (try! (as-contract (stx-transfer? (get collateral loan) tx-sender borrower)))
            (map-set loans
              { loan-id: loan-id }
              (merge loan {
                status: "repaid",
                repaid-amount: new-repaid
              })
            )
          )
          (map-set loans
            { loan-id: loan-id }
            (merge loan { repaid-amount: new-repaid })
          )
        )
      )
      (ok true)
    )
  )
)

(define-public (liquidate-loan (loan-id uint))
  (let ((loan (unwrap! (get-loan loan-id) ERR_LOAN_NOT_FOUND)))
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq (get status loan) "active") ERR_INVALID_STATE)
    (asserts! (> block-height (+ (get start-block loan) (get duration loan))) ERR_LOAN_EXPIRED)
    (try! (as-contract (stx-transfer? (get collateral loan) tx-sender (unwrap! (get lender loan) ERR_INVALID_STATE))))
    (map-set loans
      { loan-id: loan-id }
      (merge loan { status: "defaulted" })
    )
    ;; Fix: Use match instead of unwrap-panic and prevent underflow
    (match (contract-call? CREDIT_SCORE_CONTRACT get-credit-score (get borrower loan))
      current-score 
      (let ((new-score (if (> current-score u100) (- current-score u100) u0)))
        (try! (contract-call? CREDIT_SCORE_CONTRACT update-credit-score (get borrower loan) new-score))
        (ok true)
      )
      error error
    )
  )
)

(define-public (cancel-loan (loan-id uint))
  (let (
    (borrower tx-sender)
    (loan (unwrap! (get-loan loan-id) ERR_LOAN_NOT_FOUND))
    )
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq borrower (get borrower loan)) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status loan) "pending") ERR_INVALID_STATE)
    (try! (as-contract (stx-transfer? (get collateral loan) tx-sender borrower)))
    (map-set loans
      { loan-id: loan-id }
      (merge loan { status: "cancelled" })
    )
    (ok true)
  )
)

(define-public (set-loan-status (loan-id uint) (status (string-ascii 16)))
  (begin
    (asserts! (var-get contract-initialized) ERR_CONTRACT_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (match (get-loan loan-id)
      loan
      (begin
        (map-set loans
          { loan-id: loan-id }
          (merge loan { status: status })
        )
        (ok true)
      )
      ERR_LOAN_NOT_FOUND
    )
  )
)
