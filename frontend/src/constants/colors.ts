/**
 * Centralised colour palette for all charts and UI elements.
 *
 * Import from here — never hardcode hex values in component files.
 * Named after their semantic role, not their hex value.
 */

/** Core brand palette */
export const BRAND = {
  navy:      '#003087',
  blue:      '#4472C4',
  blueLight: '#BDD7EE',
  orange:    '#ED7D31',
  orangeLight:'#F9CBAD',
  green:     '#2DC274',
  purple:    '#7B3FBE',
  purpleDark:'#8B4FBF',
  indigo:    '#3560B0',
} as const;

/** Chart-specific semantic colours */
export const CHART_COLORS = {
  sellIn:      BRAND.blue,
  sellInPrev:  BRAND.blueLight,
  sellOut:     BRAND.orange,
  sellOutPrev: BRAND.orangeLight,
  doh:         BRAND.green,
  inTransit:   BRAND.purple,
  grid:        '#D9E1F2',
  axisText:    '#4B5563',
  refLine:     '#FFC000',
} as const;

/** Accuracy heatmap band colours */
export const ACCURACY_COLORS = {
  excellent:  { bg: 'bg-green-100',  text: 'text-green-800',  hex: '#BBF7D0' },
  good:       { bg: 'bg-lime-100',   text: 'text-lime-800',   hex: '#D9F99D' },
  fair:       { bg: 'bg-yellow-100', text: 'text-yellow-800', hex: '#FEF08A' },
  poor:       { bg: 'bg-orange-100', text: 'text-orange-800', hex: '#FED7AA' },
  bad:        { bg: 'bg-red-100',    text: 'text-red-800',    hex: '#FECACA' },
  none:       { bg: 'bg-gray-100',   text: 'text-gray-400',   hex: '#E5E7EB' },
} as const;

/** Summary table header colours */
export const TABLE_COLORS = {
  distributor: '#003087',
  category:    '#5B4A8A',
  dohCell:     '#2DC274',
  wohCell:     '#8B4FBF',
  endInvCell:  '#3560B0',
} as const;
