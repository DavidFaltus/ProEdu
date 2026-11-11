import React from 'react';

const BASE = import.meta.env.BASE_URL;

export function VisaLogo({ className = "h-4 sm:h-5 w-auto" }: { className?: string }) {
  return (
    <div className="h-7 px-2 bg-white rounded-md border border-gray-200 shadow-2xs flex items-center justify-center">
      <img 
        src={`${BASE}icons/payment/visa.svg`} 
        alt="Visa" 
        className={`object-contain max-h-4 max-w-[38px] ${className}`}
        loading="lazy"
      />
    </div>
  );
}

export function MastercardLogo({ className = "h-4 sm:h-5 w-auto" }: { className?: string }) {
  return (
    <div className="h-7 px-2 bg-white rounded-md border border-gray-200 shadow-2xs flex items-center justify-center">
      <img 
        src={`${BASE}icons/payment/mastercard.svg`} 
        alt="Mastercard" 
        className={`object-contain max-h-5 max-w-[32px] ${className}`}
        loading="lazy"
      />
    </div>
  );
}

export function ApplePayLogo({ className = "h-4 sm:h-5 w-auto" }: { className?: string }) {
  return (
    <div className="h-7 px-2 bg-white rounded-md border border-gray-200 shadow-2xs flex items-center justify-center">
      <img 
        src={`${BASE}icons/payment/applepay.svg`} 
        alt="Apple Pay" 
        className={`object-contain max-h-4 max-w-[38px] ${className}`}
        loading="lazy"
      />
    </div>
  );
}

export function GooglePayLogo({ className = "h-4 sm:h-5 w-auto" }: { className?: string }) {
  return (
    <div className="h-7 px-2 bg-white rounded-md border border-gray-200 shadow-2xs flex items-center justify-center">
      <img 
        src={`${BASE}icons/payment/googlepay.svg`} 
        alt="Google Pay" 
        className={`object-contain max-h-4 max-w-[38px] ${className}`}
        loading="lazy"
      />
    </div>
  );
}

export function ComgateLogoBadge({ className = "" }: { className?: string }) {
  return (
    <a 
      href="https://www.comgate.cz/cz/platebni-brana" 
      target="_blank" 
      rel="noopener noreferrer" 
      title="Platební brána Comgate"
      className="inline-flex items-center hover:opacity-85 transition-opacity"
    >
      <div className="h-7 px-2.5 bg-white rounded-md border border-gray-200 shadow-2xs flex items-center justify-center gap-1.5">
        <img 
          src={`${BASE}icons/payment/comgate.svg`} 
          alt="Comgate" 
          className={`h-4.5 w-auto object-contain ${className}`}
          loading="lazy"
        />
      </div>
    </a>
  );
}

export function PaymentLogosBar({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <VisaLogo />
      <MastercardLogo />
      <ApplePayLogo />
      <GooglePayLogo />
      <ComgateLogoBadge />
    </div>
  );
}
