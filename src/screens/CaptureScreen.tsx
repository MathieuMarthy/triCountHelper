import { useEffect, useRef, useState } from 'react';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { CropBox } from '../ui/CropBox';
import { FULL_CROP, normalizeCapture, rotateImage, type CropRect, type Rotation } from '../capture/image';
import { putImage } from '../db';
import { uid } from '../lib/id';
import { useAppStore } from '../store/useAppStore';
import type { Receipt } from '../types';

type CaptureScreenProps = {
  receipt: Receipt;
  onBack: () => void;
  onDone: () => void;
};

export function CaptureScreen({ receipt, onBack, onDone }: CaptureScreenProps) {
  const updateReceipt = useAppStore((s) => s.updateReceipt);
  const [original, setOriginal] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!original) {
      setPreview(null);
      return undefined;
    }
    void (async () => {
      const rotated = await rotateImage(original, rotation);
      if (cancelled) return;
      const url = URL.createObjectURL(rotated);
      revoked = url;
      setPreview(url);
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [original, rotation]);

  const accept = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError("Ce fichier n'est pas une image.");
      return;
    }
    setError(null);
    setOriginal(file);
    setRotation(0);
    setCrop(FULL_CROP);
  };

  const confirm = async () => {
    if (!original) return;
    setBusy(true);
    setError(null);
    try {
      const rotated = await rotateImage(original, rotation);
      const { blob } = await normalizeCapture(rotated, { crop });
      const key = receipt.imageBlobKey || uid();
      await putImage(key, blob);
      updateReceipt(receipt.id, { imageBlobKey: key, step: 'processing' });
      onDone();
    } catch {
      setError("L'image n'a pas pu être préparée. Réessayez avec une autre photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Photo du ticket"
      onBack={onBack}
      footer={
        preview ? (
          <>
            <Button variant="primary" full disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Préparation…' : 'Lire le ticket'}
            </Button>
            <button
              type="button"
              className="linkButton linkButton--center"
              onClick={() => fileInput.current?.click()}
            >
              Reprendre une photo
            </button>
          </>
        ) : (
          <Button variant="primary" full onClick={() => fileInput.current?.click()}>
            Prendre une photo
          </Button>
        )
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {preview ? (
        <>
          <CropBox src={preview} crop={crop} onChange={setCrop} />
          <div className="row row--gap row--center">
            <Button onClick={() => setRotation(((rotation + 270) % 360) as Rotation)}>
              ↺ Pivoter
            </Button>
            <Button onClick={() => setRotation(((rotation + 90) % 360) as Rotation)}>
              ↻ Pivoter
            </Button>
            <Button onClick={() => setCrop(FULL_CROP)}>Tout l’écran</Button>
          </div>
        </>
      ) : (
        <div
          className={`dropZone${dragOver ? ' dropZone--over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            accept(event.dataTransfer.files?.[0]);
          }}
        >
          <p>Déposez une photo ici, ou choisissez-en une.</p>
          <Button onClick={() => fileInput.current?.click()}>Choisir une image</Button>
        </div>
      )}

      {error ? <p className="warnText">{error}</p> : null}

      <ul className="tips">
        <li>Ticket à plat, entier dans le cadre : une ligne coupée est une ligne perdue.</li>
        <li>Évitez les reflets sur le papier brillant.</li>
        <li>Recadrez au plus près : moins d’arrière-plan, lecture plus sûre.</li>
      </ul>
    </Screen>
  );
}
