---
name: competitor-product-workflow
description: Use when developing or modifying the competitor collection product workflow in the home textile AI tool, including draft review, product approval, image set review, Shopify publishing, failure recovery, and UI/API status transitions.
---

# Competitor Product Workflow

Use this skill whenever working on the `竞品采集` / product management workflow.

## Core Rule

Do not expose Shopify publishing in draft. Publishing is only allowed after product review and image set review are complete.

## Status Machine

Canonical statuses:

```text
draft
pending_review
image_review
ready_to_publish
published
failed
```

Allowed transitions:

```text
draft -> pending_review
pending_review -> image_review
pending_review -> draft
image_review -> ready_to_publish
image_review -> pending_review
ready_to_publish -> published
ready_to_publish -> failed
failed -> draft
failed -> ready_to_publish
```

Do not add shortcuts unless the user explicitly approves them.

## Stage Behavior

### draft

Purpose: scraped product cleanup and AI copy optimization.

Show:
- save edits
- AI optimize copy
- submit to pending review

Hide or disable:
- one-click Shopify upload
- mark as published

### pending_review

Purpose: human review of product information before image generation.

Show editable/reviewable:
- Shopify product title
- price
- variants
- product images
- landing page structure
- marketing modules
- SEO title and description

Actions:
- approve product review -> `image_review`
- return to draft -> `draft`

### image_review

Purpose: generate and approve product image sets.

Required review items:
- main product image
- home scene image
- detail image
- product set completeness
- color style consistency across landing page background and image set

Actions:
- generate or enter image set review
- pass color style review
- approve image set -> `ready_to_publish`
- return to product review -> `pending_review`

### ready_to_publish

Purpose: final preflight before Shopify upload.

Show:
- one-click Shopify upload
- final confirm checklist
- expected Shopify title, variants, price, images, and landing page payload

Action:
- upload Shopify success -> `published`
- upload Shopify failure -> `failed` with error message

### published

Purpose: record confirmed Shopify success.

Show:
- Shopify product status
- Shopify product/admin link if available
- published timestamp
- upload response summary

### failed

Purpose: recover from publishing or workflow failure.

Failure examples:
- Shopify upload failed
- corrupted/garbled content
- missing required payload
- image upload failed

Show:
- failure reason
- retry upload when payload is still valid
- return to draft for editing

## Implementation Checklist

When implementing, update all of these together:

- DB schema or migration for status and review fields
- product list tab counts
- detail drawer/modal stage sections
- stage-specific buttons
- status transition API
- upload API guard: only `ready_to_publish` can publish
- failed-state error recording
- color style review field in image review
- local verification for at least one product through draft -> pending_review -> image_review -> ready_to_publish

## UI Placement

Top-level batch grab button can stay in the page header.

Never put `一键上传 Shopify` in the draft header. Put it inside the detail flow only when the product is `ready_to_publish`.

## Copy Tone

Use clear operational labels:

- `提交待审核`
- `产品审核通过`
- `退回草稿`
- `生成/进入套图审核`
- `色彩审核通过`
- `套图审核通过`
- `一键上传 Shopify`
- `标记失败`
- `重试上传`
