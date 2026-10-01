import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, X } from 'lucide-react';
import { createDetector, lookupProduct, validBarcode } from './barcode.js';

function cameraErrorMessage(error) {
  if (!navigator.mediaDevices?.getUserMedia) return 'Camera needs a secure (HTTPS) connection. Type the code instead.';
  if (error?.name === 'NotAllowedError') return 'Camera access was blocked. Allow it in your browser settings, or type the code.';
  if (error?.name === 'NotFoundError') return 'No camera found. Type the code instead.';
  return 'Could not start the camera. Type the code instead.';
}

export function BarcodeScanner({ onProduct, onClose }) {
  const videoRef = useRef(null);
  const [phase, setPhase] = useState('scanning');
  const [message, setMessage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [code, setCode] = useState('');

  async function lookup(value) {
    setCode(value);
    setPhase('looking');
    try {
      const product = await lookupProduct(value);
      if (product) return onProduct(product);
      setMessage(`No product found for ${value}. Try again, or describe it in your own words.`);
    } catch (error) {
      setMessage(error.message);
    }
    setPhase('failed');
  }

  useEffect(() => {
    if (phase !== 'scanning') return undefined;
    let stopped = false;
    let stream;
    let timer;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const detect = await createDetector();
        const tick = async () => {
          if (stopped) return;
          const found = await detect(video).catch(() => null);
          if (stopped) return;
          if (found && validBarcode(found)) {
            navigator.vibrate?.(40);
            lookup(found);
            return;
          }
          timer = setTimeout(tick, 150);
        };
        tick();
      } catch (error) {
        if (!stopped) setCameraError(cameraErrorMessage(error));
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [phase]);

  function submitCode(event) {
    event.preventDefault();
    event.stopPropagation();
    const value = code.trim();
    if (validBarcode(value)) lookup(value);
  }

  return (
    <div className="barcode-scanner">
      <div className="barcode-heading">
        <span>Scan a product barcode</span>
        <button type="button" onClick={onClose} aria-label="Close scanner"><X /></button>
      </div>
      {!cameraError && phase !== 'failed' && <div className="barcode-viewport">
        <video ref={videoRef} muted playsInline aria-label="Camera preview" />
        <i className="barcode-frame" aria-hidden="true" />
        {phase === 'looking' && <p className="barcode-status"><LoaderCircle className="ai-loading" aria-hidden="true" />Looking up {code}…</p>}
      </div>}
      {cameraError && <p className="barcode-message">{cameraError}</p>}
      {phase === 'failed' && <div className="barcode-message barcode-failed">
        <span>{message}</span>
        {!cameraError && <button type="button" onClick={() => { setMessage(''); setPhase('scanning'); }}><RefreshCw aria-hidden="true" />Scan again</button>}
      </div>}
      <div className="barcode-manual">
        <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') submitCode(event); }} inputMode="numeric" maxLength={14} placeholder="Or type the number" aria-label="Barcode number" />
        <button type="button" onClick={submitCode} disabled={!validBarcode(code.trim()) || phase === 'looking'}>Look up</button>
      </div>
      <small className="barcode-credit">Product data from Open Food Facts</small>
    </div>
  );
}
