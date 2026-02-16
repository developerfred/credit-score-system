;; Agent Registry Contract
;; Implementation of Agent Registry following SIP-xxx / ERC-8004 pattern on Stacks

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_AGENT_EXISTS (err u101))
(define-constant ERR_AGENT_NOT_FOUND (err u102))
(define-constant ERR_INVALID_METADATA (err u103))
(define-constant ERR_NOT_ACTIVE (err u104))
(define-constant ERR_INVALID_REPUTATION (err u105))

;; Data Maps
(define-map agents
  { agent-id: principal }
  {
    name: (string-ascii 64),
    description: (string-ascii 256),
    capabilities: (list 20 (string-ascii 32)),
    endpoint: (string-ascii 256),
    reputation: uint,
    created-at: uint,
    updated-at: uint,
    is-active: bool,
    owner: principal
  }
)

(define-map agent-authorizations
  { agent: principal, user: principal }
  { authorized: bool, expires-at: uint }
)

(define-map agent-performance
  { agent: principal }
  {
    total-tasks: uint,
    successful-tasks: uint,
    failed-tasks: uint,
    rating-sum: uint,
    rating-count: uint
  }
)

(define-map capability-registry
  { capability: (string-ascii 32) }
  { description: (string-ascii 128), agents-count: uint }
)

;; Agent NFT for ownership
(define-non-fungible-token agent-nft uint)
(define-data-var agent-nft-counter uint u0)

;; Read-only functions

(define-read-only (get-agent (agent-id principal))
  (map-get? agents { agent-id: agent-id })
)

(define-read-only (is-agent-active (agent-id principal))
  (default-to false (get is-active (map-get? agents { agent-id: agent-id })))
)

(define-read-only (is-user-authorized (agent principal) (user principal))
  (let ((auth-data (map-get? agent-authorizations { agent: agent, user: user })))
    (match auth-data
      auth (and (get authorized auth) (> (get expires-at auth) block-height))
      false
    )
  )
)

(define-read-only (get-agent-performance (agent principal))
  (default-to 
    { total-tasks: u0, successful-tasks: u0, failed-tasks: u0, rating-sum: u0, rating-count: u0 }
    (map-get? agent-performance { agent: agent })
  )
)

(define-read-only (get-agent-rating (agent principal))
  (let ((perf (get-agent-performance agent)))
    (if (> (get rating-count perf) u0)
      (/ (get rating-sum perf) (get rating-count perf))
      u0
    )
  )
)

(define-read-only (get-agents-by-capability (capability (string-ascii 32)))
  (map-get? capability-registry { capability: capability })
)

;; Public functions

(define-public (register-agent 
  (name (string-ascii 64))
  (description (string-ascii 256))
  (capabilities (list 20 (string-ascii 32)))
  (endpoint (string-ascii 256))
)
  (let ((agent-id tx-sender))
    (asserts! (is-none (map-get? agents { agent-id: agent-id })) ERR_AGENT_EXISTS)
    (asserts! (> (len name) u0) ERR_INVALID_METADATA)
    
    ;; Mint agent NFT
    (let ((nft-id (+ (var-get agent-nft-counter) u1)))
      (var-set agent-nft-counter nft-id)
      (try! (nft-mint? agent-nft nft-id agent-id))
    )
    
    ;; Register agent
    (map-set agents
      { agent-id: agent-id }
      {
        name: name,
        description: description,
        capabilities: capabilities,
        endpoint: endpoint,
        reputation: u500, ;; Initial reputation score
        created-at: block-height,
        updated-at: block-height,
        is-active: true,
        owner: agent-id
      }
    )
    
    ;; Initialize performance tracking
    (map-set agent-performance
      { agent: agent-id }
      {
        total-tasks: u0,
        successful-tasks: u0,
        failed-tasks: u0,
        rating-sum: u0,
        rating-count: u0
      }
    )
    
    ;; Update capability registry
    (map update-capability-count capabilities)
    
    (ok agent-id)
  )
)

(define-public (update-agent
  (name (optional (string-ascii 64)))
  (description (optional (string-ascii 256)))
  (endpoint (optional (string-ascii 256)))
  (is-active (optional bool))
)
  (let ((agent-id tx-sender))
    (match (map-get? agents { agent-id: agent-id })
      agent-data
      (begin
        (asserts! (is-eq (get owner agent-data) agent-id) ERR_UNAUTHORIZED)
        
        (map-set agents
          { agent-id: agent-id }
          (merge agent-data
            {
              name: (default-to (get name agent-data) name),
              description: (default-to (get description agent-data) description),
              endpoint: (default-to (get endpoint agent-data) endpoint),
              is-active: (default-to (get is-active agent-data) is-active),
              updated-at: block-height
            }
          )
        )
        
        (ok true)
      )
      ERR_AGENT_NOT_FOUND
    )
  )
)

(define-public (authorize-agent (agent principal) (duration uint))
  (let ((user tx-sender))
    (asserts! (is-agent-active agent) ERR_NOT_ACTIVE)
    
    (map-set agent-authorizations
      { agent: agent, user: user }
      { authorized: true, expires-at: (+ block-height duration) }
    )
    
    (ok true)
  )
)

(define-public (revoke-agent-authorization (agent principal))
  (let ((user tx-sender))
    (map-delete agent-authorizations { agent: agent, user: user })
    (ok true)
  )
)

(define-public (record-task-completion (agent principal) (success bool) (rating uint))
  (let ((caller tx-sender))
    (asserts! (is-authorized-updater caller) ERR_UNAUTHORIZED)
    (asserts! (<= rating u5) ERR_INVALID_REPUTATION)
    
    (match (map-get? agent-performance { agent: agent })
      perf
      (begin
        (map-set agent-performance
          { agent: agent }
          {
            total-tasks: (+ (get total-tasks perf) u1),
            successful-tasks: (+ (get successful-tasks perf) (if success u1 u0)),
            failed-tasks: (+ (get failed-tasks perf) (if success u0 u1)),
            rating-sum: (+ (get rating-sum perf) rating),
            rating-count: (+ (get rating-count perf) u1)
          }
        )
        
        ;; Update agent reputation based on performance
        (update-agent-reputation agent)
        
        (ok true)
      )
      ERR_AGENT_NOT_FOUND
    )
  )
)

(define-public (rate-agent (agent principal) (rating uint))
  (let ((user tx-sender))
    (asserts! (is-agent-active agent) ERR_NOT_ACTIVE)
    (asserts! (<= rating u5) ERR_INVALID_REPUTATION)
    
    (match (map-get? agent-performance { agent: agent })
      perf
      (begin
        (map-set agent-performance
          { agent: agent }
          (merge perf {
            rating-sum: (+ (get rating-sum perf) rating),
            rating-count: (+ (get rating-count perf) u1)
          })
        )
        (ok true)
      )
      ERR_AGENT_NOT_FOUND
    )
  )
)

;; Private functions

(define-private (update-capability-count (capability (string-ascii 32)))
  (let ((current (map-get? capability-registry { capability: capability })))
    (match current
      data (map-set capability-registry 
        { capability: capability }
        (merge data { agents-count: (+ (get agents-count data) u1) })
      )
      (map-set capability-registry 
        { capability: capability }
        { description: "", agents-count: u1 }
      )
    )
  )
)

(define-private (update-agent-reputation (agent principal))
  (match (map-get? agent-performance { agent: agent })
    perf
    (let (
      (success-rate (if (> (get total-tasks perf) u0)
        (/ (* (get successful-tasks perf) u1000) (get total-tasks perf))
        u500
      ))
      (avg-rating (if (> (get rating-count perf) u0)
        (* (/ (get rating-sum perf) (get rating-count perf)) u100)
        u0
      ))
    )
      (let ((new-reputation (/ (+ success-rate avg-rating) u2)))
        (match (map-get? agents { agent-id: agent })
          agent-data
          (map-set agents
            { agent-id: agent }
            (merge agent-data { reputation: new-reputation })
          )
          false
        )
      )
    )
    false
  )
)

(define-private (is-authorized-updater (updater principal))
  (is-eq updater CONTRACT_OWNER)
)

;; Admin functions

(define-public (register-capability (capability (string-ascii 32)) (description (string-ascii 128)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-set capability-registry
      { capability: capability }
      { description: description, agents-count: u0 }
    )
    (ok true)
  )
)

(define-public (deactivate-agent (agent principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (match (map-get? agents { agent-id: agent })
      agent-data
      (begin
        (map-set agents
          { agent-id: agent }
          (merge agent-data { is-active: false, updated-at: block-height })
        )
        (ok true)
      )
      ERR_AGENT_NOT_FOUND
    )
  )
)
