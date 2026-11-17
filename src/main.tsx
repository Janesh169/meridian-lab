import { render } from 'preact';
import './styles.css';
import { App } from './app/App';
import { Controller } from './app/lifecycle';
import { audio } from './audio/engine';

const c = new Controller();
audio.setSfxVolume(c.save.prefs.sfxVolume);
render(<App c={c} />, document.getElementById('app')!);
void c.start();

if (__TEST_BUILD__) (window as any).__meridian = { c, audio };
