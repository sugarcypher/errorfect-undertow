#!/usr/bin/env bash
# One-time Stripe setup for Errorfect Undertow access (live mode, ThinkWell Labs account).
# Mirrors the Word Autopsy link: $39 USD one-time, statement descriptor ERRORFECT,
# billing address auto, no promo codes. Creates:
#   product + price, a payment link that returns buyers to Undertow, and a webhook
#   endpoint on the Worker. Then hands the link and webhook secret to the Worker.
# Safe to re-run: it reuses the product, price, link and webhook if they already exist.
#
# Run:  bash ~/"Documents/ThinkWell Labs/Finished/Errorfect/errorfectENGINE/worker/setup-stripe.sh"
set -euo pipefail

WORKER=errorfect-undertow-api
API=https://errorfect-undertow-api.13531nxt.workers.dev
SITE=https://sugarcypher.github.io/errorfect-undertow/
TAG=undertow-access-1
DESC="Access to Errorfect Undertow, a tool that shows how a text or a body of work moves its reader toward a belief, an action, or a way of thinking. One-time payment. Includes deep reads with Claude, up to 10 a day."

j() { sed -n '/^{/,$p'; }   # strip any CLI notices before the JSON

echo "Product…"
PRODUCT=$(stripe products search --live --query "metadata['product']:'$TAG'" | j | jq -r '.data[0].id // empty')
if [ -z "$PRODUCT" ]; then
  PRODUCT=$(stripe products create --live -d "name=Errorfect Undertow" -d "description=$DESC" \
    -d "statement_descriptor=ERRORFECT" -d "metadata[product]=$TAG" | j | jq -r .id)
fi
echo "  $PRODUCT"

echo "Price…"
PRICE=$(stripe prices list --live --product "$PRODUCT" --active true | j | jq -r '[.data[] | select(.unit_amount==3900 and .currency=="usd" and .type=="one_time")][0].id // empty')
if [ -z "$PRICE" ]; then
  PRICE=$(stripe prices create --live -d "product=$PRODUCT" -d unit_amount=3900 -d currency=usd | j | jq -r .id)
fi
echo "  $PRICE"

echo "Payment link…"
LINK=$(stripe payment_links list --live --active true --limit 100 | j | jq -c "[.data[] | select(.metadata.product==\"$TAG\")][0] // empty")
if [ -z "$LINK" ]; then
  LINK=$(stripe payment_links create --live \
    -d "line_items[0][price]=$PRICE" -d "line_items[0][quantity]=1" \
    -d "after_completion[type]=redirect" \
    -d "after_completion[redirect][url]=${SITE}?session_id={CHECKOUT_SESSION_ID}" \
    -d "billing_address_collection=auto" -d "allow_promotion_codes=false" \
    -d "custom_text[submit][message]=After payment you return to Undertow, and access opens in that browser." \
    -d "metadata[product]=$TAG" | j | jq -c .)
fi
LINK_ID=$(jq -r .id <<<"$LINK")
LINK_URL=$(jq -r .url <<<"$LINK")
echo "  $LINK_ID  $LINK_URL"

echo "Webhook…"
HOOK_ID=$(stripe webhook_endpoints list --live --limit 100 | j | jq -r "[.data[] | select(.url==\"$API/stripe/webhook\")][0].id // empty")
if [ -n "$HOOK_ID" ]; then
  # The signing secret is only shown at creation, so replace the endpoint to get a fresh one.
  stripe webhook_endpoints delete --live "$HOOK_ID" --confirm >/dev/null
fi
HOOK=$(stripe webhook_endpoints create --live -d "url=$API/stripe/webhook" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=charge.refunded" \
  -d "description=Errorfect Undertow access" | j)
echo "  $(jq -r .id <<<"$HOOK")"

echo "Handing settings to the Worker…"
jq -r .secret <<<"$HOOK" | wrangler secret put STRIPE_WEBHOOK_SECRET --name "$WORKER" >/dev/null
printf %s "$LINK_ID"  | wrangler secret put STRIPE_PAYMENT_LINK_ID --name "$WORKER" >/dev/null
printf %s "$LINK_URL" | wrangler secret put STRIPE_PAYMENT_URL --name "$WORKER" >/dev/null

echo
curl -s "$API/health"; echo
echo "Done. Checkout: $LINK_URL"
