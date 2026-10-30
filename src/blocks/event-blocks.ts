import type { EventInfoProps, EventInfoSource, Locale, RsvpProps, TicketProps } from './types';

export type RsvpButton = 'register' | 'decline';

/**
 * The tag each RSVP button links with. Direct links open the form (`intent=register|decline`); the
 * others open the event page. Personal links recognize the guest, shared ones do not.
 */
export function rsvpLinkCode(props: Pick<RsvpProps, 'direct' | 'personal'>, button: RsvpButton): string {
  const scope = props.personal ? 'guest' : 'event';
  if (!props.direct) return `${scope}.registration_page_url`;
  return button === 'decline' ? `${scope}.decline_form_url` : `${scope}.registration_form_url`;
}

/** The event's own button texts (set for the registration page). Empty RSVP labels fall back to these. */
export const RSVP_EVENT_TEXT_KEYS: Record<RsvpButton, string> = {
  register: 'event.start_registration_button',
  decline: 'event.decline_registration_button',
};

/** Last fallback for RSVP labels, matching the registration page's default buttons. */
export const RSVP_DEFAULT_LABELS: Record<RsvpButton, Record<Locale, string>> = {
  register: { en: 'Start registration', da: 'Start registrering', de: 'Anmeldung starten', swe: 'Starta registrering' },
  decline: { en: "I won't attend", da: 'Jeg deltager ikke', de: 'Ich nehme nicht teil', swe: 'Jag deltar inte' },
};

/** Personal ticket tag with the block's options as parameters (`size`, `details`). */
export function ticketTagRaw(props: Pick<TicketProps, 'qrSize' | 'showDetails'>): string {
  return `{{guest.personal_ticket;;size=${props.qrSize}&details=${props.showDetails ? 1 : 0}}}`;
}

export type EventInfoRow = 'when' | 'where';

/** Tags that fill When & where rows set to the event's own value. */
export const EVENT_INFO_TAG_CODES: Record<EventInfoRow, string> = {
  when: 'event.start_date',
  where: 'event.address',
};

/** The source prop of each When & where row. */
export function eventInfoSource(props: Pick<EventInfoProps, 'whenSource' | 'whereSource'>, row: EventInfoRow): EventInfoSource {
  return row === 'when' ? props.whenSource : props.whereSource;
}

/** Labels of the three calendar buttons, as the server renders them. */
export const CALENDAR_BUTTON_LABELS: Record<'google' | 'outlook' | 'download', Record<Locale, string>> = {
  google: { en: 'Google Calendar', da: 'Google Kalender', de: 'Google Kalender', swe: 'Google Kalender' },
  outlook: { en: 'Outlook', da: 'Outlook', de: 'Outlook', swe: 'Outlook' },
  download: { en: 'Download (.ics)', da: 'Download (.ics)', de: 'Herunterladen (.ics)', swe: 'Ladda ner (.ics)' },
};
