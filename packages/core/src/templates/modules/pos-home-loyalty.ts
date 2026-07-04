import type { TemplateEntry } from '../types.js';

/**
 * POS Smart Grid home templates — loyalty lookup + custom-discount tiles.
 *
 * Every entry is a `pos.extension` targeting the POS **home** surface
 * (`pos.home.tile.render` / `pos.home.modal.render`). A tile taps to present its
 * companion modal (`presentation: 'TILE_MODAL'`, the derived default for
 * `pos.home.tile.render`); a few author the modal target directly.
 *
 * Grounded in the loyalty corpus (smile-io / bon-loyalty / loyaltylion / rivo /
 * stamped / growave). The real in-store loyalty pattern those apps ship is a home
 * tile that (a) LOOKS UP a customer's points balance/tier via the app proxy and
 * (b) LETS STAFF APPLY a redemption or manual discount to the open cart. Amount /
 * percentage POS reward types (Rivo/Stamped "POS Amount discount" / "POS Percentage
 * off") map to APPLY_CART_DISCOUNT; code redemptions map to APPLY_CODE_DISCOUNT;
 * points read/write map to the app-proxy LOYALTY_READ / LOYALTY_WRITE actions.
 *
 * HONESTY: the loyalty ledger is app-owned. `loyalty.points` / `loyalty.tier`
 * bindings and LOYALTY_READ / LOYALTY_WRITE resolve through `appProxyPath`; until
 * the app proxy serves that route they degrade to the block's literal `label`
 * (never a fabricated balance). Cart-surface actions (discount/note/property) are
 * NOT used here — the POS home surface carries no cart context, so this file uses
 * only home-resolvable actions (PRESENT_MODAL, LOYALTY_READ/WRITE, APP_PROXY_POST)
 * plus the cart-write discount actions the shipped block applies to the *active*
 * POS cart (APPLY_CART_DISCOUNT / APPLY_CODE_DISCOUNT are cart-global, not
 * line-scoped, so they run from a home modal against the current sale).
 */
export const POS_HOME_LOYALTY_TEMPLATES: TemplateEntry[] = [
  // POS-HOME-01 — the canonical Smile/BON/Rivo "look up a member" home tile.
  {
    id: 'POS-HOME-01',
    name: 'Loyalty Lookup Tile',
    description: 'POS Smart Grid home tile that opens a modal to look up the current customer’s points balance and VIP tier from the loyalty ledger.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'points', 'lookup', 'home', 'staff'],
    spec: {
      type: 'pos.extension',
      name: 'Loyalty Lookup Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Loyalty Lookup',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'PRESENT_MODAL',
      },
    },
  },

  // POS-HOME-02 — the companion modal that actually reads the balance (LOYALTY_READ + binding).
  {
    id: 'POS-HOME-02',
    name: 'Points Balance Modal',
    description: 'POS home modal that reads and displays the customer’s current points balance from the app-proxy loyalty ledger.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'points', 'balance', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Points Balance Modal',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.modal.render',
        label: 'Points Balance',
        blockKind: 'modal',
        presentation: 'STANDALONE',
        action: 'LOYALTY_READ',
        binding: 'loyalty.points',
        appProxyPath: '/apps/loyalty/pos/balance',
      },
    },
  },

  // POS-HOME-03 — VIP tier status tile (tier binding).
  {
    id: 'POS-HOME-03',
    name: 'VIP Tier Status Tile',
    description: 'POS home tile that shows the current customer’s VIP tier (Silver/Gold/Platinum) read from the loyalty ledger, with a modal for tier perks.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'vip', 'tier', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'VIP Tier Status Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'VIP Tier',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'LOYALTY_READ',
        binding: 'loyalty.tier',
        appProxyPath: '/apps/loyalty/pos/tier',
      },
    },
  },

  // POS-HOME-04 — redeem points → apply the resulting discount to the open sale (LOYALTY_WRITE, PIN-gated).
  {
    id: 'POS-HOME-04',
    name: 'Redeem Points Modal',
    description: 'POS home modal that debits points from the ledger and records the in-store redemption via the app proxy, staff-PIN gated.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'redeem', 'points', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Redeem Points Modal',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.modal.render',
        label: 'Redeem Points',
        blockKind: 'modal',
        presentation: 'STANDALONE',
        action: 'LOYALTY_WRITE',
        appProxyPath: '/apps/loyalty/pos/redeem',
        staffPin: {
          required: true,
          reason: 'Redeeming loyalty points debits the customer balance.',
          role: 'cashier',
        },
      },
    },
  },

  // POS-HOME-05 — accrue points on an in-store action (LOYALTY_WRITE, no PIN).
  {
    id: 'POS-HOME-05',
    name: 'Earn Points Tile',
    description: 'POS home tile that credits loyalty points for an in-store engagement (signup, review, birthday) by writing a ledger entry via the app proxy.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'earn', 'points', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Earn Points Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Award Points',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'LOYALTY_WRITE',
        appProxyPath: '/apps/loyalty/pos/earn',
        staffPin: {
          required: true,
          reason: 'Awarding points credits the customer balance.',
        },
      },
    },
  },

  // POS-HOME-06 — POS Amount-off reward applied to the current cart (Rivo/Stamped "POS Amount discount").
  {
    id: 'POS-HOME-06',
    name: 'Custom Amount Discount Tile',
    description: 'POS home tile that applies a fixed-amount discount to the active sale — the "POS Amount off" reward staff apply in-store, PIN gated.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'discount', 'amount-off', 'reward', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Custom Amount Discount Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: '$5 Loyalty Reward',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'APPLY_CART_DISCOUNT',
        actionConfig: {
          discountTitle: 'Loyalty reward',
          discountKind: 'FixedAmount',
          discountAmount: '5.00',
        },
        staffPin: {
          required: true,
          reason: 'Applies a manual discount to the sale.',
        },
      },
    },
  },

  // POS-HOME-07 — POS Percentage-off reward applied to the current cart (Rivo/Stamped "POS Percentage off").
  {
    id: 'POS-HOME-07',
    name: 'Custom Percentage Discount Tile',
    description: 'POS home tile that applies a percentage discount to the active sale — the "POS Percentage off" staff reward, PIN gated.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'discount', 'percentage-off', 'reward', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Custom Percentage Discount Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: '10% Member Discount',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'APPLY_CART_DISCOUNT',
        actionConfig: {
          discountTitle: 'Member discount',
          discountKind: 'Percentage',
          discountAmount: '10',
        },
        staffPin: {
          required: true,
          reason: 'Applies a manual discount to the sale.',
          role: 'manager',
        },
      },
    },
  },

  // POS-HOME-08 — staff discount modal with a larger override (manager-gated).
  {
    id: 'POS-HOME-08',
    name: 'Manager Discount Override Modal',
    description: 'POS home modal for a manager-authorized percentage override applied to the active sale, gated behind a staff PIN with a manager role.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'discount', 'override', 'manager', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Manager Discount Override Modal',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.modal.render',
        label: 'Manager Discount',
        blockKind: 'modal',
        presentation: 'STANDALONE',
        action: 'APPLY_CART_DISCOUNT',
        actionConfig: {
          discountTitle: 'Manager override',
          discountKind: 'Percentage',
          discountAmount: '20',
        },
        staffPin: {
          required: true,
          reason: 'Manager approval required for a discount above the standard limit.',
          role: 'manager',
        },
      },
    },
  },

  // POS-HOME-09 — apply a redemption CODE minted by the loyalty app (APPLY_CODE_DISCOUNT).
  {
    id: 'POS-HOME-09',
    name: 'Apply Reward Code Tile',
    description: 'POS home tile that applies a loyalty reward discount code to the active sale — the redemption code minted by the loyalty app, entered by staff.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'discount', 'code', 'reward', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Apply Reward Code Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Apply Reward Code',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'APPLY_CODE_DISCOUNT',
        actionConfig: {
          discountCode: 'LOYALTY-REWARD',
        },
      },
    },
  },

  // POS-HOME-10 — enroll a walk-in customer in the loyalty program (APP_PROXY_POST).
  {
    id: 'POS-HOME-10',
    name: 'Enroll Member Modal',
    description: 'POS home modal that enrolls a walk-in customer in the loyalty program by posting their details to the app-proxy enrollment endpoint.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'enroll', 'signup', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Enroll Member Modal',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.modal.render',
        label: 'Join Rewards',
        blockKind: 'modal',
        presentation: 'STANDALONE',
        action: 'APP_PROXY_POST',
        appProxyPath: '/apps/loyalty/pos/enroll',
      },
    },
  },

  // POS-HOME-11 — scan/lookup a member by QR code (Growave/Rivo QR flow) via app proxy.
  {
    id: 'POS-HOME-11',
    name: 'Member QR Lookup Tile',
    description: 'POS home tile that opens a modal to identify a member by their account QR code and read their loyalty balance from the app proxy.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'qr', 'lookup', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Member QR Lookup Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Scan Member QR',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'LOYALTY_READ',
        binding: 'loyalty.points',
        appProxyPath: '/apps/loyalty/pos/qr-lookup',
      },
    },
  },

  // POS-HOME-12 — display-only rewards catalog tile (NONE action, informational modal).
  {
    id: 'POS-HOME-12',
    name: 'Rewards Catalog Tile',
    description: 'POS home tile that opens an informational modal listing the in-store rewards staff can offer, with points cost per reward.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'rewards', 'catalog', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Rewards Catalog Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Rewards Menu',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'PRESENT_MODAL',
      },
    },
  },

  // POS-HOME-13 — birthday reward tile: award bonus points on the member's birthday (LOYALTY_WRITE, PIN).
  {
    id: 'POS-HOME-13',
    name: 'Birthday Bonus Tile',
    description: 'POS home tile that credits a birthday bonus to the member’s points balance via the app proxy, staff-PIN gated.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'loyalty', 'birthday', 'bonus', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'Birthday Bonus Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Birthday Bonus',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'LOYALTY_WRITE',
        appProxyPath: '/apps/loyalty/pos/birthday-bonus',
        staffPin: {
          required: true,
          reason: 'Awarding a birthday bonus credits the customer balance.',
        },
      },
    },
  },

  // POS-HOME-14 — first-order staff discount tile for new members (APPLY_CART_DISCOUNT, no PIN).
  {
    id: 'POS-HOME-14',
    name: 'New Member Welcome Discount Tile',
    description: 'POS home tile that applies a fixed welcome discount to a new member’s first in-store purchase on the active sale.',
    category: 'ADMIN_UI',
    type: 'pos.extension',
    icon: 'pos',
    tags: ['pos', 'discount', 'welcome', 'new-member', 'home'],
    spec: {
      type: 'pos.extension',
      name: 'New Member Welcome Discount Tile',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'pos.home.tile.render',
        label: 'Welcome Discount',
        blockKind: 'tile',
        presentation: 'TILE_MODAL',
        action: 'APPLY_CART_DISCOUNT',
        actionConfig: {
          discountTitle: 'Welcome reward',
          discountKind: 'FixedAmount',
          discountAmount: '10.00',
        },
      },
    },
  },
];
