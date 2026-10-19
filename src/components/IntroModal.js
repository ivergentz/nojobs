import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * IntroModal — full-viewport opener: "Iver Gentz" becomes "Iver Bohnes".
 *
 * Timeline (s):  0.0 "IVER / GENTZ" set
 *                0.9 crimson strike draws through GENTZ
 *                1.6 GENTZ letters fall away, "geb. Gentz" settles small
 *                2.0 BOHNES rises letter by letter
 *                2.9 note fades in
 *                5.2 curtain lifts (auto) — or "Skip" / "Enter" / Esc anytime
 *
 * Plays once per browser session on the home page. Can be replayed via
 * window.dispatchEvent(new Event('replay-name-intro')) (Nav: "geb. Gentz").
 * With reduced motion it never auto-plays; a replay shows the final state.
 */

const KEY = 'ib-intro-seen';
const ease = [0.22, 1, 0.36, 1];

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 100;
  background: ${({ theme }) => theme.colors.ink};
  color: ${({ theme }) => theme.colors.paper};
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
  height: 100dvh;
  padding: clamp(18px, 3vw, 36px) ${({ theme }) => theme.gutter};
  overflow: hidden;
  outline: none;
`;

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;

  .kicker {
    color: ${({ theme }) => theme.colors.accentOnInk};
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .kicker::before {
    content: '';
    width: 28px;
    height: 2px;
    background: currentColor;
  }
`;

const Skip = styled.button`
  background: none;
  border: 0;
  padding: 8px 0;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.paper};
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  border-bottom: 1px solid rgba(250, 250, 248, 0.4);

  &:hover {
    border-color: ${({ theme }) => theme.colors.paper};
  }
`;

const Stage = styled.div`
  align-self: center;
  max-width: ${({ theme }) => theme.sizes.maxWidth};
  width: 100%;
  margin: 0 auto;
`;

const Big = styled.div`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 700;
  text-transform: uppercase;
  font-size: clamp(88px, 18vw, 280px);

  @media (max-width: 620px) {
    font-size: 25vw;
  }
  line-height: 0.86;
  letter-spacing: -0.01em;
`;

const Row = styled.div`
  display: block;
  overflow: hidden;
  padding-bottom: 0.04em;
`;

const Slot = styled.div`
  position: relative;
  display: grid;
  > * {
    grid-area: 1 / 1;
  }
`;

const Letters = styled.span`
  display: inline-flex;
  position: relative;
  width: max-content;
`;

const Letter = styled(motion.span)`
  display: inline-block;

  &.new {
    color: ${({ theme }) => theme.colors.accentOnInk};
  }
`;

const Strike = styled(motion.span)`
  position: absolute;
  left: -2%;
  right: -2%;
  top: 52%;
  height: 0.07em;
  background: ${({ theme }) => theme.colors.accentOnInk};
  transform-origin: left center;
`;

const Former = styled(motion.p)`
  margin-top: clamp(14px, 2vw, 24px);
  font-family: ${({ theme }) => theme.fonts.italic};
  font-style: italic;
  font-size: clamp(22px, 2.6vw, 40px);
  color: ${({ theme }) => theme.colors.inkMuteOnInk};

  s {
    text-decoration-color: ${({ theme }) => theme.colors.accentOnInk};
    text-decoration-thickness: 2px;
  }
`;

const Bottom = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px 32px;
  max-width: ${({ theme }) => theme.sizes.maxWidth};
  width: 100%;
  margin: 0 auto;

  .note {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 600;
    font-size: clamp(22px, 2.6vw, 36px);
    text-transform: uppercase;
    line-height: 1;
  }
  .sub {
    margin-top: 8px;
    font-family: ${({ theme }) => theme.fonts.serif};
    font-style: italic;
    font-size: clamp(16px, 1.4vw, 19px);
    color: ${({ theme }) => theme.colors.inkMuteOnInk};
  }
`;

const Enter = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 50px;
  padding: 0 22px;
  border: 0;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.accent};
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transition: background 220ms ease, color 220ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.paper};
    color: ${({ theme }) => theme.colors.ink};
  }
`;

/* Auf iverbohnes.de / iverbohnes.com kennt der Besucher den neuen Namen schon —
   dort startet die Seite direkt, ohne Intro. ivergentz.de zeigt es weiter. */
function isBohnesDomain() {
  try {
    return /bohnes/i.test(window.location.hostname);
  } catch (e) {
    return false;
  }
}

function readSeen() {
  if (isBohnesDomain()) return true;
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch (e) {
    return false;
  }
}
function writeSeen() {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch (e) {
    /* storage unavailable — ignore */
  }
}

export default function IntroModal() {
  const { t } = useLanguage();
  const c = t.intro;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(() => !reduce && !readSeen());
  const [run, setRun] = useState(0); // increments on replay to restart the timeline
  const [phase, setPhase] = useState(reduce ? 5 : 0);
  const dialogRef = useRef(null);
  const lastFocus = useRef(null);

  const close = useCallback(() => {
    writeSeen();
    setOpen(false);
  }, []);

  /* replay hook */
  useEffect(() => {
    const onReplay = () => {
      setPhase(reduce ? 5 : 0);
      setRun((n) => n + 1);
      setOpen(true);
    };
    window.addEventListener('replay-name-intro', onReplay);
    return () => window.removeEventListener('replay-name-intro', onReplay);
  }, [reduce]);

  /* timeline */
  useEffect(() => {
    if (!open || reduce) return undefined;
    const steps = [
      [900, 1],
      [1600, 2],
      [2000, 3],
      [2900, 4],
    ];
    const timers = steps.map(([ms, p]) => setTimeout(() => setPhase(p), ms));
    const auto = setTimeout(close, 5600);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(auto);
    };
  }, [open, run, reduce, close]);

  /* scroll lock, focus, Escape */
  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = setTimeout(() => dialogRef.current && dialogRef.current.focus({ preventScroll: true }), 50);
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus({ preventScroll: true });
    };
  }, [open, close]);

  const from = c.from.split('');
  const to = c.to.split('');
  const showFinal = reduce || phase >= 3;

  return (
    <AnimatePresence>
      {open && (
        <Overlay
          key={`intro-${run}`}
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${c.first} ${c.from} → ${c.first} ${c.to}`}
          initial={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)', transition: { duration: 0.9, ease: [0.76, 0, 0.24, 1] } }}
        >
          <Top>
            <span className="kicker">{c.kicker}</span>
            <Skip type="button" onClick={close}>
              {c.skip}
            </Skip>
          </Top>

          <Stage>
            <Big aria-hidden="true">
              <Row>
                <motion.div
                  initial={reduce ? false : { y: '100%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.9, ease }}
                >
                  {c.first}
                </motion.div>
              </Row>
              <Row>
                <Slot>
                  {/* old name */}
                  {!showFinal && (
                    <Letters>
                      {from.map((ch, i) => (
                        <Letter
                          key={`f${i}`}
                          initial={{ y: '100%' }}
                          animate={
                            phase >= 2
                              ? {
                                  y: '120%',
                                  rotate: (i % 2 ? 1 : -1) * (6 + i * 2),
                                  opacity: 0,
                                  transition: { duration: 0.55, ease: [0.55, 0, 0.9, 0.5], delay: i * 0.04 },
                                }
                              : { y: '0%', transition: { duration: 0.9, ease, delay: 0.15 + i * 0.04 } }
                          }
                        >
                          {ch}
                        </Letter>
                      ))}
                      <Strike
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: phase >= 1 ? 1 : 0, opacity: phase >= 2 ? 0 : 1 }}
                        transition={{ duration: 0.5, ease }}
                      />
                    </Letters>
                  )}
                  {/* new name */}
                  {showFinal && (
                    <Letters>
                      {to.map((ch, i) => (
                        <Letter
                          className="new"
                          key={`t${i}`}
                          initial={reduce ? false : { y: '110%' }}
                          animate={{ y: '0%' }}
                          transition={{ duration: 0.9, ease, delay: i * 0.055 }}
                        >
                          {ch}
                        </Letter>
                      ))}
                    </Letters>
                  )}
                </Slot>
              </Row>
            </Big>
            <Former
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 10 }}
              transition={{ duration: 0.7, ease }}
            >
              {c.formerLabel} <s>{c.from}</s>
            </Former>
            <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
              {c.first} {c.to}, {c.formerLabel} {c.from}
            </span>
          </Stage>

          <Bottom
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: phase >= 4 || reduce ? 1 : 0, y: phase >= 4 || reduce ? 0 : 14 }}
            transition={{ duration: 0.8, ease }}
          >
            <div>
              <p className="note">{c.note}</p>
              <p className="sub">{c.sub}</p>
            </div>
            <Enter type="button" onClick={close}>
              {c.enter}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 1v12M7 13l-5-5M7 13l5-5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </Enter>
          </Bottom>
        </Overlay>
      )}
    </AnimatePresence>
  );
}
