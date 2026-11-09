"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code for a payment link. The code is generated in the browser
 * so no payment URL is sent to a third-party image service.
 */
export function QrCode({
  value,
  size = 200,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#14532d", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (error) {
    return (
      <p className="text-xs text-muted-foreground">
        Could not render the QR code.
      </p>
    );
  }

  return (
    <figure className="inline-flex flex-col items-center gap-2">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={label ? `QR code for ${label}` : "QR code"}
          width={size}
          height={size}
          className="rounded-lg border border-border bg-white p-1"
        />
      ) : (
        <div
          className="animate-pulse rounded-lg border border-border bg-muted"
          style={{ width: size, height: size }}
        />
      )}
      {label ? (
        <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      ) : null}
    </figure>
  );
}
