import type { TemplateEntry } from '../types.js';

/**
 * Customer-account loyalty / rewards hub templates (recipeType = customerAccount.blocks).
 *
 * Grounded in the loyalty/wishlist/membership corpus (Smile.io, LoyaltyLion, Rivo,
 * Growave, Swym Wishlist Plus, Bold Memberships). Every entry is a config-driven block
 * set the shipped generic customer-account UI extension (extensions/customer-account-ui)
 * mounts onto Polaris `s-*` web components at a CUSTOMER_ACCOUNT target.
 *
 * HONESTY: `bind` values only DECLARE the live source they want. On the current surface,
 * loyalty (`loyalty.points`), store-credit (`customer.storeCreditBalance`) and
 * subscription (`subscription.*`) bindings resolve through our app proxy / Customer
 * Account API and degrade to the block's literal `content` when the app-proxy loyalty
 * source (or a required protected-data grant) is not yet live — never a fake value.
 * FORM `submit.proxyPath`es are app-proxy subpaths the captured values POST to.
 */
export const CAB_LOY_TEMPLATES: TemplateEntry[] = [
  // ── CAB-LOY-01 — Smile.io: Loyalty Hub points dashboard (Profile page) ──────
  {
    id: 'CAB-LOY-01',
    name: 'Smile Loyalty Hub — Points Dashboard',
    description: 'Full loyalty-hub points dashboard on the customer account profile page — live balance, tier status, and a redeem CTA modeled on Smile.io.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['smile-io', 'loyalty', 'points', 'rewards', 'profile', 'hub'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Smile Loyalty Hub — Points Dashboard',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'Your rewards',
        blocks: [
          { kind: 'TEXT', content: 'Welcome back — here is your loyalty balance.', bind: 'customer.displayName' },
          { kind: 'BADGE', content: '0 points', tone: 'info', bind: 'loyalty.points' },
          { kind: 'TEXT', content: 'Earn points on every order, review, and referral.' },
          { kind: 'DIVIDER' },
          { kind: 'BUTTON', content: 'Redeem points', variant: 'primary', modalId: 'redeem' },
          {
            kind: 'MODAL',
            id: 'redeem',
            content: 'Choose a reward to redeem your points for a Shopify discount code applied at checkout.',
          },
          { kind: 'LINK', content: 'See all ways to earn', url: 'https://example.com/rewards' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-02 — Smile.io: Earned-points banner on order status ─────────────
  {
    id: 'CAB-LOY-02',
    name: 'Smile Earned-Points Banner',
    description: 'Order-status announcement telling the customer how many loyalty points this order earned, in the Smile.io "you earned N points" pattern.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['smile-io', 'loyalty', 'points', 'order-status', 'announcement'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Smile Earned-Points Banner',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.announcement.render',
        title: 'You earned points',
        blocks: [
          { kind: 'BADGE', content: 'Points earned', tone: 'success' },
          { kind: 'TEXT', content: 'Thanks for your order — your points balance has been updated.', bind: 'loyalty.points' },
          { kind: 'LINK', content: 'View your rewards', url: 'https://example.com/account/rewards' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-03 — LoyaltyLion: tabbed rewards panel (page render) ────────────
  {
    id: 'CAB-LOY-03',
    name: 'LoyaltyLion Rewards Panel',
    description: 'Account-page rewards panel with earn/spend messaging and a claim-reward modal, modeled on the LoyaltyLion loyalty pop-up tabs.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['loyaltylion', 'loyalty', 'rewards', 'points', 'page'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'LoyaltyLion Rewards Panel',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.page.render',
        title: 'Loyalty program',
        blocks: [
          { kind: 'TEXT', content: 'Your points', bind: 'customer.displayName' },
          { kind: 'BADGE', content: '0 points', tone: 'info', bind: 'loyalty.points' },
          { kind: 'DIVIDER' },
          { kind: 'TEXT', content: 'Ways to spend — redeem for money off your next order.' },
          { kind: 'BUTTON', content: 'Claim a reward', variant: 'primary', modalId: 'claim' },
          {
            kind: 'MODAL',
            id: 'claim',
            content: 'Redeeming generates a Shopify discount code you can apply at checkout. Existing store rules still apply.',
          },
          { kind: 'LINK', content: 'How the program works', url: 'https://example.com/loyalty' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-04 — LoyaltyLion: VIP tier progress (profile) ───────────────────
  {
    id: 'CAB-LOY-04',
    name: 'LoyaltyLion VIP Tier Progress',
    description: 'Profile-page VIP tier status block showing current tier and progress toward the next boundary, in the LoyaltyLion tier pattern.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['loyaltylion', 'loyalty', 'vip', 'tier', 'profile'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'LoyaltyLion VIP Tier Progress',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'VIP status',
        blocks: [
          { kind: 'BADGE', content: 'Silver member', tone: 'info' },
          { kind: 'TEXT', content: 'Spend more this year to reach Gold and unlock a 2x points multiplier.' },
          { kind: 'TEXT', content: 'Lifetime orders', bind: 'customer.ordersCount' },
          { kind: 'DIVIDER' },
          { kind: 'LINK', content: 'See tier benefits', url: 'https://example.com/loyalty/tiers' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-05 — Rivo: account sidebar loyalty embed (page) ──────────────────
  {
    id: 'CAB-LOY-05',
    name: 'Rivo Account Loyalty Embed',
    description: 'Compact account-page loyalty embed showing points, tier, and a referral share button, modeled on the Rivo branded account sidebar.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['rivo', 'loyalty', 'points', 'referral', 'page'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Rivo Account Loyalty Embed',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.page.render',
        title: 'Rewards & referrals',
        blocks: [
          { kind: 'BADGE', content: '0 points', tone: 'info', bind: 'loyalty.points' },
          { kind: 'TEXT', content: 'Invite friends and you both get a reward on their first order.' },
          { kind: 'BUTTON', content: 'Invite friends', variant: 'primary', modalId: 'refer' },
          {
            kind: 'MODAL',
            id: 'refer',
            content: 'Share your personal referral link by email or social. Your reward is issued after your friend’s first purchase.',
          },
          { kind: 'LINK', content: 'View reward history', url: 'https://example.com/account/rewards' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-06 — Rivo: referral invite form (profile) ───────────────────────
  {
    id: 'CAB-LOY-06',
    name: 'Rivo Refer-a-Friend Form',
    description: 'Profile-page referral form capturing a friend’s email and note, posted to the app proxy, in the Rivo advocate-invite pattern.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['rivo', 'referral', 'loyalty', 'form', 'profile'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Rivo Refer-a-Friend Form',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'Invite friends',
        blocks: [
          { kind: 'TEXT', content: 'Give friends a reward on their first order — you get one too.' },
          {
            kind: 'FORM',
            content: 'Send an invite',
            fields: [
              { kind: 'email', key: 'friend_email', label: 'Friend’s email', placeholder: 'name@example.com', required: true },
              { kind: 'textarea', key: 'personal_note', label: 'Personal note', placeholder: 'Thought you’d love this shop…' },
            ],
            submit: { proxyPath: '/apps/superapp/ca/referral-invite', submitLabel: 'Send invite' },
          },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-07 — Growave: store-credit balance (profile) ────────────────────
  {
    id: 'CAB-LOY-07',
    name: 'Growave Store-Credit Balance',
    description: 'Profile-page store-credit balance block with a spend CTA, modeled on the Growave loyalty store-credit reward type.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['growave', 'store-credit', 'loyalty', 'balance', 'profile'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Growave Store-Credit Balance',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'Store credit',
        blocks: [
          { kind: 'TEXT', content: 'Available store credit' },
          { kind: 'BADGE', content: '$0.00', tone: 'success', bind: 'customer.storeCreditBalance' },
          { kind: 'TEXT', content: 'Store credit applies automatically at checkout.' },
          { kind: 'LINK', content: 'Shop now', url: 'https://example.com/collections/all' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-08 — Growave: loyalty info + rewards on order status ─────────────
  {
    id: 'CAB-LOY-08',
    name: 'Growave Loyalty Info — Order Status',
    description: 'Order-status loyalty info block showing points earned plus store credit, modeled on the Growave order-status loyalty widget.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['growave', 'loyalty', 'points', 'store-credit', 'order-status'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Growave Loyalty Info — Order Status',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-status.block.render',
        title: 'Your rewards',
        blocks: [
          { kind: 'TEXT', content: 'Points balance', bind: 'loyalty.points' },
          { kind: 'BADGE', content: 'Store credit available', tone: 'success', bind: 'customer.storeCreditBalance' },
          { kind: 'DIVIDER' },
          { kind: 'BUTTON', content: 'Leave a review to earn points', variant: 'secondary', modalId: 'review' },
          {
            kind: 'MODAL',
            id: 'review',
            content: 'Write a review of a product from this order to earn bonus loyalty points.',
          },
          { kind: 'LINK', content: 'Open rewards page', url: 'https://example.com/account/rewards' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-09 — Swym: wishlist rail on profile ─────────────────────────────
  {
    id: 'CAB-LOY-09',
    name: 'Swym Wishlist Rail',
    description: 'Profile-page wishlist block linking to the customer’s saved products, modeled on the Swym Wishlist Plus account wishlist rail.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['swym', 'wishlist', 'saved', 'profile', 'account'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Swym Wishlist Rail',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'Your wishlist',
        blocks: [
          { kind: 'TEXT', content: 'Products you saved for later, synced across every device.' },
          { kind: 'BUTTON', content: 'View my wishlist', variant: 'primary', url: 'https://example.com/apps/swym/wishlist' },
          { kind: 'LINK', content: 'Recently viewed', url: 'https://example.com/apps/swym/recently-viewed' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-10 — Swym: back-in-stock / price-drop alert opt-in form ──────────
  {
    id: 'CAB-LOY-10',
    name: 'Swym Wishlist Alerts Opt-In',
    description: 'Profile-page form to opt into back-in-stock and price-drop alerts for wishlisted products, in the Swym watchlist-alert pattern.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['swym', 'wishlist', 'back-in-stock', 'price-drop', 'form'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Swym Wishlist Alerts Opt-In',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'Wishlist alerts',
        blocks: [
          { kind: 'TEXT', content: 'Get notified when saved products come back in stock or drop in price.' },
          {
            kind: 'FORM',
            content: 'Alert preferences',
            fields: [
              { kind: 'checkbox', key: 'back_in_stock', label: 'Back-in-stock alerts' },
              { kind: 'checkbox', key: 'price_drop', label: 'Price-drop alerts' },
              { kind: 'email', key: 'alert_email', label: 'Send alerts to', placeholder: 'name@example.com', required: true },
            ],
            submit: { proxyPath: '/apps/superapp/ca/wishlist-alerts', submitLabel: 'Save preferences' },
          },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-11 — Bold: membership self-service panel (page) ──────────────────
  {
    id: 'CAB-LOY-11',
    name: 'Bold Membership Self-Service',
    description: 'Account-page membership panel showing plan status with pause/cancel actions, modeled on the Bold Memberships self-service UI.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['bold', 'membership', 'subscription', 'self-service', 'page'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Bold Membership Self-Service',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.page.render',
        title: 'Your membership',
        blocks: [
          { kind: 'BADGE', content: 'Active', tone: 'success', bind: 'subscription.status' },
          { kind: 'TEXT', content: 'Next billing date', bind: 'subscription.nextOrderDate' },
          { kind: 'TEXT', content: 'Manage your plan, update details, pause, or cancel anytime.' },
          { kind: 'DIVIDER' },
          { kind: 'BUTTON', content: 'Manage membership', variant: 'primary', modalId: 'manage' },
          {
            kind: 'MODAL',
            id: 'manage',
            content: 'Pause or cancel your membership. Changes take effect on your next billing cycle.',
          },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-12 — Bold: member perks summary (profile) ───────────────────────
  {
    id: 'CAB-LOY-12',
    name: 'Bold Member Perks Summary',
    description: 'Profile-page block listing active membership perks — store credit, member discount, and free shipping — in the Bold auto-applied-perks pattern.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['bold', 'membership', 'perks', 'store-credit', 'profile'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Bold Member Perks Summary',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.profile.block.render',
        title: 'Member perks',
        blocks: [
          { kind: 'BADGE', content: 'Gold member', tone: 'info' },
          { kind: 'TEXT', content: 'Store credit', bind: 'customer.storeCreditBalance' },
          { kind: 'TEXT', content: 'Member discount and free shipping are auto-applied each billing cycle.' },
          { kind: 'BADGE', content: 'Free shipping', tone: 'success' },
          { kind: 'LINK', content: 'See all perks', url: 'https://example.com/membership/perks' },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-13 — Order action: start a return / redeem reward (order action) ─
  {
    id: 'CAB-LOY-13',
    name: 'Loyalty Order Action — Redeem or Return',
    description: 'Order-scoped action menu-item that opens a modal to redeem loyalty points or request a return for items in this order.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['loyalty', 'return', 'order-action', 'rewards', 'order'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Loyalty Order Action — Redeem or Return',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order.action.menu-item.render',
        title: 'Rewards & returns',
        blocks: [
          {
            kind: 'ACTION',
            action: 'modal',
            content: 'Redeem points toward store credit, or start a return for items in this order.',
          },
          {
            kind: 'FORM',
            content: 'Request a return',
            fields: [
              {
                kind: 'select',
                key: 'return_reason',
                label: 'Reason',
                options: [
                  { value: 'wrong_size', label: 'Wrong size' },
                  { value: 'damaged', label: 'Arrived damaged' },
                  { value: 'not_as_described', label: 'Not as described' },
                  { value: 'other', label: 'Other' },
                ],
                required: true,
              },
              { kind: 'textarea', key: 'return_note', label: 'Details', placeholder: 'Tell us what happened…' },
            ],
            submit: { proxyPath: '/apps/superapp/ca/return-request', submitLabel: 'Submit request' },
          },
        ],
        b2bOnly: false,
      },
    },
  },

  // ── CAB-LOY-14 — Order-index loyalty announcement (points summary) ──────────
  {
    id: 'CAB-LOY-14',
    name: 'Loyalty Order-Index Announcement',
    description: 'Announcement above the customer’s order list summarizing their points balance and store credit with a link to the rewards hub.',
    category: 'CUSTOMER_ACCOUNT',
    type: 'customerAccount.blocks',
    icon: 'customer',
    tags: ['loyalty', 'points', 'store-credit', 'order-index', 'announcement'],
    spec: {
      type: 'customerAccount.blocks',
      name: 'Loyalty Order-Index Announcement',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-index.announcement.render',
        title: 'Your rewards summary',
        blocks: [
          { kind: 'BADGE', content: '0 points', tone: 'info', bind: 'loyalty.points' },
          { kind: 'BADGE', content: '$0.00 credit', tone: 'success', bind: 'customer.storeCreditBalance' },
          { kind: 'TEXT', content: 'Keep shopping to earn points and unlock rewards.' },
          { kind: 'LINK', content: 'Open rewards hub', url: 'https://example.com/account/rewards' },
        ],
        b2bOnly: false,
      },
    },
  },
];
