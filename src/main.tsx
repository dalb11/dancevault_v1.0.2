import {createRoot} from 'react-dom/client';
import {Capacitor} from '@capacitor/core';
import {StatusBar, Style} from '@capacitor/status-bar';
import App from './App.tsx';
import './index.css';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({style: Style.Dark}).catch(() => {});
  StatusBar.setBackgroundColor({color: '#131313'}).catch(() => {});
  StatusBar.setOverlaysWebView({overlay: false}).catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
