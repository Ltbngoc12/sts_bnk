# Sentosa Case Management System (CMS) - Design System

This document defines the official **Warm Resort-Luxury** Design System for the Sentosa Development Corporation (SDC) Case Management System. All future pages, components, and stylesheet updates must strictly adhere to these guidelines to maintain visual coherence and brand identity.

> [!IMPORTANT]
> **Single Theme Constraint**: This project operates under a strict **Single Theme Policy**. The Warm Resort-Luxury light/cream theme is the only theme for the application. Do **NOT** implement dark mode, dark themes, or theme togglers.

---

## 1. Brand Identity & Visual Style

The design system moves away from typical "cold corporate IT" colors (slate blues and grays) and embraces a warm, high-end, editorial-resort aesthetic. It is directly inspired by Sentosa's 2023 brand refresh (**"Where discovery never ends"**), combining:
- The energy of the tropical sun (**Radiant Orange**).
- The grounding presence of the earth (**Chestnut Brown**).
- The tranquility of the sea and flora (**Ocean Teal**).
- The luxury of the sunset chạng vạng (**Dusk Purple**).
- The natural texture of the sand (**Sand Cream**).

---

## 2. Design Tokens (Colors)

These color tokens are defined as CSS variables in [globals.css](file:///d:/Huy%20Sentosa/src/app/globals.css) and should be referenced using `var(...)`.

| Token Name | CSS Variable | Hex Value | Role & Usage |
| :--- | :--- | :--- | :--- |
| **Primary (Brand)** | `--color-primary` | `#FF8200` | Radiant Sentosa Orange. Used for accents, warning alerts, active states, and brand highlights. |
| **Primary Dark** | `--color-primary-dark` | `#6D3500` | Chestnut Brown. Used for primary buttons, executive titles, and bold typography. |
| **Secondary** | `--color-secondary` | `#008C95` | Ocean Teal. Used for standard map pins, success states, and standard navigation items. |
| **Tertiary** | `--color-tertiary` | `#4A148C` | Dusk Purple. Used for secondary status indicators (e.g., Pending Review) and custom tags. |
| **Base Background** | `--bg-base` | `#F4F1EA` | Warm Sand Cream. Used as the main body background. |
| **Card Background** | `--bg-card` | `#FBFBFA` | Warm Paper Off-White. Solid background for container cards (`.glass`) and input headers. |
| **Sidebar Background**| `--bg-sidebar` | `#F4F1EA` | Matches base background. Creates a seamless, expansive editorial layout structure. |
| **Text Main** | `--text-main` | `#2B1F1D` | Deep Espresso Brown. Main font color for optimal readability with a warm, luxurious feel. |
| **Text Muted** | `--text-muted` | `#7C6E65` | Warm Taupe-Gray. Used for secondary labels, descriptions, and metadata. |
| **Border Color** | `--border-color` | `#E6DFD5` | Warm Beige. Used for clean dividers, borders, and input boxes. |
| **Border Hover** | `--border-color-hover`| `#CBD2C5` | Soft olive-beige border for hover states on inputs and cards. |

---

## 3. Typography

The system uses a **hybrid typeface model** that combines editorial serif headers with modern geometric sans-serif tables and labels.

### Font Families
- **Display Serif Font**: `'Playfair Display', Georgia, serif` (CSS: `var(--font-title)`).
  - *Usage*: Large page titles (`h1`, `h2`), dashboard metrics values, and major cards headers.
- **Geometric Sans Font**: `'Inter', sans-serif` (CSS: `var(--font-body)`).
  - *Usage*: Body text, table data, timeline lists, button text, and logs.
- **Accompanying Sans Font**: `'Outfit', sans-serif`.
  - *Usage*: Logo subtitles, navigation labels, and small uppercase captions.

### Typography Hierarchy

| Style | Font Family | Size | Weight | Line Height | Case / Spacing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title (h1)** | Playfair Display | `20px` | `800` | `1.3` | Letter-spacing: `0.03em` |
| **Section Header (h2)**| Playfair Display | `14px` | `700` | `1.4` | Letter-spacing: `0.05em` |
| **Metric Value** | Playfair Display | `32px` | `700` | `1` | Solid |
| **Body Text** | Inter | `13.5px`| `500` | `1.5` | Standard |
| **Table Header** | Inter | `12px` | `700` | `1` | Uppercase, spacing: `0.03em` |
| **Brand Subtitle** | Outfit | `10.5px`| `800` | `1` | Uppercase, spacing: `0.14em` |

---

## 4. UI Components & Layout Classes

### 1. Cards (`.glass`)
Cards should group related data blocks. They use a soft background, subtle border, and custom shadows.
```css
.glass {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 4px 20px -2px rgba(43, 31, 29, 0.03), 0 2px 6px -1px rgba(43, 31, 29, 0.02);
}
.glass:hover {
  border-color: var(--border-color-hover);
  box-shadow: 0 10px 25px -5px rgba(43, 31, 29, 0.05), 0 8px 12px -6px rgba(43, 31, 29, 0.03);
}
```

### 2. Buttons (`.btn`)
All buttons must use the `.btn` base class, combined with one of the following modifiers:
- `.btn-primary` (Chestnut Brown): Default action buttons.
- `.btn-brand` / `.btn-orange` (Radiant Orange): Prominent call-to-actions, status shifts, or alerts.
- `.btn-secondary` (Warm Cream): Cancel actions or secondary settings.
- `.btn-success` (Teal): Submitting reviews, resolving items.
- `.btn-danger` (Crimson): Delete, reject, or urgent recall.

### 3. Status Badges (`.badge`)
Badges use high-contrast text on top of a low-opacity color tint (glow) with a colored border:
- **Live / Emergency**: `.badge-live` (Terracotta Red)
- **Acknowledged / Alert**: `.badge-ack` (Vibrant Orange/Amber)
- **On-Site / In Progress**: `.badge-onsite` (Ocean Teal)
- **Completed**: `.badge-completed` (Teal Tint)
- **Pending Review**: `.badge-review` (Dusk Purple)
- **Closed / Read-Only**: `.badge-closed` (Warm Slate/Taupe)

---

## 5. Coding Guidelines for Styling

To ensure consistency, developers must follow these guidelines:
1. **Never Hardcode Hex Colors**: Always reference CSS variables (`var(--color-primary)`, `var(--text-main)`, etc.).
2. **Left-Alignment Rule**: Ensure all aligned subtitles (such as header text in cards or sidebar sections) match the container padding boundaries. Add padding offsets when icons/images have visual blank margins.
3. **Breathing Space (Whitespace)**: Keep container paddings at `24px` and grid margins at `20px` to maintain a spacious, premium feel.
4. **Legibility First**: In high-density screens (like table logs and checklists), use `Inter` with weight `500` or `600` instead of a serif font to ensure readability under operational pressure.
