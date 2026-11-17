/** MOSS's barks: break warnings, lock lines, study-screen lines. Pure text data. */
export const MOSS_LINES = {
  warn5: [
    'Reactor reserves at five minutes. I’m saying it once and then I’m sulking.',
    'Five minutes of reserve power left. Find a good place to stop: the lab saves itself.',
    'Five minutes. I’m dimming the corridor lights for dramatic effect.',
  ],
  warn1: [
    'One minute. The reactor is running on fumes and good intentions.',
    'Sixty seconds. Whatever you’re doing, the lab will remember it. Go and study.',
    'One minute left. I’ll keep your place. I always do.',
  ],
  lock: [
    'Reserve power exhausted. The lab is sealed until you’ve recharged the reactor.',
    'That’s the reactor dry. Go and study. I’ll keep the ferns company.',
    'Lights out. Your progress is saved, right down to the last slider.',
  ],
  study: [
    'Running on reserve power. Every minute you study charges the reactor.',
    'The ferns and I are holding the fort. Go on, the lab will be here.',
    'I’ve dimmed everything to save power. Your study time is the generator.',
    'Not now. Study first. I’ll still be sarcastic later.',
  ],
  idle: [
    'The lab is dark. Study to charge the reactor and earn your next visit.',
    'No reserve power banked. A study session is the only way in.',
  ],
};

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
