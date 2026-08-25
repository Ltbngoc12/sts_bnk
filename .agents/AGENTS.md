# Sentosa Design System Guidelines & Agent Rules

Whenever building new pages, updating components, or modifying styles in the Sentosa codebase, always adhere to the following design system rules to maintain visual consistency.

## 1. Typography
- **Primary Font**: `Inter` (sans-serif) for all headers, titles, labels, and body copy.
- **Monospace Font**: `JetBrains Mono` for all IDs, badges, and technical fields.
- **Import Location**: Managed inside [globals.css](file:///c:/Users/huy.duong/OneDrive%20-%20BnK%20Solutions%20JSC/Project/Sentosa/CODE/src/app/globals.css).

## 2. Core Color Scheme (Clean Light Theme)
- **Page Background (`--bg-base`)**: Off-white/light grey (`#F3F4F6`).
- **Sidebar & Card Background (`--bg-sidebar`, `--bg-card`)**: Pure white (`#FFFFFF`).
- **Primary Brand Accent (`--color-primary`)**: Orange (`#FF8200`). Used for primary interactive highlights, sidebar active icon/text, and core CTA buttons.

## 3. ID Badge Conventions
Always style ID badges using the specific semantic color rules:
- **Case ID Badge (`c.id` or `caseData.id`)**:
  - Style: Info/Blue theme.
  - Colors: `color: var(--color-info)`, `background: var(--color-info-bg)`, `border-color: var(--color-info-border)`.
- **Incident ID Badge (`inc.id` or `incident.id`)**:
  - Style: Critical/Red theme.
  - Colors: `color: var(--color-critical)`, `background: var(--color-critical-bg)`, `border-color: var(--color-critical-border)`.
- **Badge Shape**: Use className `mono-id` which automatically applies a monospace font and standard padding.

## 4. Tables and Lists
- **Table Headers**: Must be transparent or white background with a thin bottom border (`border-bottom: 1px solid var(--border-color)`). No grey or dark header backgrounds.
- **Row Padding**: High density but readable padding (e.g., `padding: 14px 16px` for table cells and `12px 16px` for headers).
- **Interactive Rows**: When clicking a row triggers navigation, nested links (like Case/Incident IDs) must use `onClick={(e) => e.stopPropagation()}` to prevent event bubbling.

## 5. Sidebar (Menu) Style
- **Background**: White `#FFFFFF` with a subtle right-border (`1px solid var(--sidebar-divider)`).
- **Active Menu Item**: Light orange background (`var(--sidebar-active-bg)` / `#FFF7ED`), orange text & icon (`var(--color-primary)` / `#FF8200`), no thick left/right borders.
