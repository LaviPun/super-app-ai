/**
 * Intent examples for Tier B embedding similarity (Phase 2.1).
 * 8-10 example prompts per clean intent. Used to precompute embeddings for cosine similarity.
 * Source: docs/ai-module-main-doc.md §15.6 Tier B.
 */

export const INTENT_EXAMPLES: Record<string, string[]> = {
  'promo.popup': [
    'add a popup with 10% off discount for new visitors',
    'show a modal after 5 seconds with a coupon code',
    'exit intent popup to recover abandoning shoppers',
    'popup with a newsletter signup and discount offer',
    'lightbox offer when user is about to leave',
    'show a promo modal once per session on the homepage',
    'birthday discount popup for returning customers',
    'limited time offer popup with countdown timer',
  ],
  'promo.banner': [
    'add a hero banner with a summer sale headline and CTA',
    'create a promotional banner image with a shop now button',
    'add a full-width banner announcing free shipping',
    'animated banner with a product feature highlight',
    'sale banner at the top of the collection page',
    'seasonal promotion banner with a discount code',
  ],
  'promo.free_shipping_bar': [
    'free shipping bar that shows how much more to spend',
    'add a progress bar for free shipping threshold',
    'show "add $15 more for free shipping" above the cart',
  ],
  'promo.countdown': [
    'countdown timer for a flash sale ending soon',
    'add a timer showing the sale ends in 24 hours',
    'urgency countdown for Black Friday deal',
  ],
  'promo.discount_reveal': [
    'scratch card to reveal a discount code',
    'spin the wheel for a random discount',
    'reveal a coupon code after email signup',
  ],
  'engage.exit_intent': [
    'detect when user is leaving and show an offer',
    'exit popup to reduce cart abandonment',
    'catch visitors before they leave with a last-chance deal',
  ],
  'engage.newsletter_capture': [
    'email capture popup for newsletter signup',
    'collect emails in exchange for a discount',
    'subscribe to newsletter form in a popup',
    'sign up for updates to get 15% off first order',
  ],
  'utility.announcement': [
    'announcement bar at the top of every page',
    'show a store notice about holiday shipping times',
    'add a dismissible notice about maintenance',
    'banner saying the store is moving to a new URL',
  ],
  'utility.effect': [
    'add falling snow for Christmas',
    'show confetti when someone lands on the homepage',
    'winter snowfall effect on the storefront',
    'seasonal decoration with snow particles',
    'confetti celebration for a store anniversary',
    'holiday visual effect overlay on all pages',
  ],
  'utility.floating_widget': [
    'add a WhatsApp chat button floating at the bottom right',
    'floating chat widget to talk to support',
    'scroll to top button in the bottom corner',
    'sticky WhatsApp contact button',
    'floating coupon button that opens a popup',
    'bottom right chat bubble for customer support',
    'add a floating cart button',
  ],
  'upsell.cart_upsell': [
    'show related products at checkout',
    'add a product recommendation block in the cart',
    'upsell complementary items before checkout',
    'cross-sell add-on at the checkout step',
  ],
  'upsell.post_purchase': [
    'one-click upsell after purchase confirmation',
    'offer a complementary product after checkout',
    'post-purchase page with a discounted add-on',
  ],
  'upsell.bundle_builder': [
    'bundle builder to sell products together at a discount',
    'buy 3 for the price of 2 bundle',
    'product bundle with a quantity discount',
  ],
  'trust.badges': [
    'add trust badges showing secure checkout',
    'display payment security icons near checkout',
    'show money-back guarantee and free returns badges',
  ],
  'trust.reviews_snippet': [
    'show star ratings and reviews snippet on product page',
    'display review count and average rating badge',
  ],
  'info.size_guide': [
    'size guide popup for clothing products',
    'add a size chart modal on the product page',
    'help customers find the right size with a guide',
  ],
  'info.shipping_returns': [
    'show shipping and returns information block',
    'delivery timeline and return policy section',
    'add estimated delivery dates to the product page',
  ],
  'merch.before_after': [
    'before and after comparison slider',
    'show product transformation with a slider',
    'before/after image reveal for skincare product',
  ],
  'admin.dashboard_card': [
    'add a card to the Shopify admin dashboard showing metrics',
    'admin extension to display campaign performance',
    'admin block to quickly duplicate a product',
  ],
  'flow.create_workflow': [
    'automate sending an email when an order is tagged',
    'create a workflow that runs when a customer registers',
    'set up a Shopify Flow automation for order fulfillment',
    'trigger a discount when a customer has 5 orders',
  ],
  'functions.discountRules': [
    'give 20% off to customers tagged as VIP',
    'create a tiered discount based on cart total',
    'BOGO discount rule for a specific collection',
    'automatic discount for wholesale customers',
  ],
  'functions.deliveryCustomization': [
    'hide standard shipping for PO box addresses',
    'show express shipping only for certain zip codes',
    'rename shipping methods based on cart content',
  ],
  'support.troubleshoot': [
    'help me fix why my popup is not showing',
    'debug why the discount function is not applying',
    'the banner is not appearing on mobile',
  ],
};
