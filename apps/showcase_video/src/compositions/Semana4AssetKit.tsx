import React from 'react';
import { Semana4Q80ScreenAsset } from '../scenes/semana4_fisico/Semana4Q80ScreenAsset';
import { Semana4Ticket80mmAsset } from '../scenes/semana4_fisico/Semana4Ticket80mmAsset';
import { Semana4OverlaysScene } from '../scenes/semana4_fisico/Semana4OverlaysScene';
import { Semana4HeroSalesScreenAsset } from '../scenes/semana4_fisico/Semana4HeroSalesScreenAsset';

/** Asset 1: Pantalla MIRAY Q80 (800×1280 lógico @2x = 1600×2560), UI real de MultiCurrencyCheckoutDialog. */
export const Semana4PosScreen: React.FC = () => <Semana4Q80ScreenAsset />;

/** Asset 2: Ticket térmico 80 mm a 300 dpi (945×1256), layout real ReceiptLayoutFormatter.format80mm. */
export const Semana4Ticket80mm: React.FC = () => <Semana4Ticket80mmAsset />;

/** Asset 3: Overlays cinéticos 1080×1920 con fondo transparente (PNG alpha), 1 frame por overlay. */
export const Semana4Overlays: React.FC = () => <Semana4OverlaysScene />;

/** Web Hero: pantalla de ventas del POS (`SaleView`, menú café verbatim) para montaje en dispositivo agarrado por mano. */
export const Semana4HeroSalesScreen: React.FC = () => <Semana4HeroSalesScreenAsset />;
