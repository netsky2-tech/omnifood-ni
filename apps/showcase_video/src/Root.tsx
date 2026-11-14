import React from 'react';
import { Composition } from 'remotion';
import { ShowcaseMaster } from './compositions/ShowcaseMaster';
import { SocialReel } from './compositions/SocialReel';
import { SpeedReel } from './compositions/SpeedReel';
import { FiscalReel } from './compositions/FiscalReel';
import { OfflineReel } from './compositions/OfflineReel';
import { BlindAuditReel } from './compositions/BlindAuditReel';
import { HoldOrdersReel } from './compositions/HoldOrdersReel';
import { OwnerDashboardReel } from './compositions/OwnerDashboardReel';
import { VoidAuditReel } from './compositions/VoidAuditReel';
import { MultiCurrencyReel } from './compositions/MultiCurrencyReel';
import { KardexAuditReel } from './compositions/KardexAuditReel';
import { MetricsShowcase } from './compositions/MetricsShowcase';
import { COMPOSITION_PRESETS } from './tokens/brand';
import './styles/global.css';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1. Composición Master 16:9 (Horizontal para Web / Demos / YouTube) */}
      <Composition
        id={COMPOSITION_PRESETS.showcaseMaster.id}
        component={ShowcaseMaster}
        durationInFrames={COMPOSITION_PRESETS.showcaseMaster.durationInFrames}
        fps={COMPOSITION_PRESETS.showcaseMaster.fps}
        width={COMPOSITION_PRESETS.showcaseMaster.width}
        height={COMPOSITION_PRESETS.showcaseMaster.height}
      />

      {/* 2. Parte 2 del showcase: Métricas de Convenios (16:9) */}
      <Composition
        id={COMPOSITION_PRESETS.metricsShowcase.id}
        component={MetricsShowcase}
        durationInFrames={COMPOSITION_PRESETS.metricsShowcase.durationInFrames}
        fps={COMPOSITION_PRESETS.metricsShowcase.fps}
        width={COMPOSITION_PRESETS.metricsShowcase.width}
        height={COMPOSITION_PRESETS.metricsShowcase.height}
      />

      {/* 3. Composición Vertical 9:16 (Instagram Reels / TikTok / YouTube Shorts) */}
      <Composition
        id={COMPOSITION_PRESETS.socialReel.id}
        component={SocialReel}
        durationInFrames={COMPOSITION_PRESETS.socialReel.durationInFrames}
        fps={COMPOSITION_PRESETS.socialReel.fps}
        width={COMPOSITION_PRESETS.socialReel.width}
        height={COMPOSITION_PRESETS.socialReel.height}
      />

      {/* 4. Reel Vertical 9:16 - Tema A: Velocidad y Ergonomía en Mostrador */}
      <Composition
        id={COMPOSITION_PRESETS.speedReel.id}
        component={SpeedReel}
        durationInFrames={COMPOSITION_PRESETS.speedReel.durationInFrames}
        fps={COMPOSITION_PRESETS.speedReel.fps}
        width={COMPOSITION_PRESETS.speedReel.width}
        height={COMPOSITION_PRESETS.speedReel.height}
      />

      {/* 5. Reel Vertical 9:16 - Tema B: Certeza Contable y Cumplimiento DGI */}
      <Composition
        id={COMPOSITION_PRESETS.fiscalReel.id}
        component={FiscalReel}
        durationInFrames={COMPOSITION_PRESETS.fiscalReel.durationInFrames}
        fps={COMPOSITION_PRESETS.fiscalReel.fps}
        width={COMPOSITION_PRESETS.fiscalReel.width}
        height={COMPOSITION_PRESETS.fiscalReel.height}
      />

      {/* 6. Reel Vertical 9:16 - Tema C: Continuidad Real Offline */}
      <Composition
        id={COMPOSITION_PRESETS.offlineReel.id}
        component={OfflineReel}
        durationInFrames={COMPOSITION_PRESETS.offlineReel.durationInFrames}
        fps={COMPOSITION_PRESETS.offlineReel.fps}
        width={COMPOSITION_PRESETS.offlineReel.width}
        height={COMPOSITION_PRESETS.offlineReel.height}
      />

      {/* 7. Reel Vertical 9:16 - Martes: Cierre de Turno y Arqueo Ciego */}
      <Composition
        id={COMPOSITION_PRESETS.blindAuditReel.id}
        component={BlindAuditReel}
        durationInFrames={COMPOSITION_PRESETS.blindAuditReel.durationInFrames}
        fps={COMPOSITION_PRESETS.blindAuditReel.fps}
        width={COMPOSITION_PRESETS.blindAuditReel.width}
        height={COMPOSITION_PRESETS.blindAuditReel.height}
      />

      {/* 8. Reel Vertical 9:16 - Cuentas en Espera y Variantes en Mostrador */}
      <Composition
        id={COMPOSITION_PRESETS.holdOrdersReel.id}
        component={HoldOrdersReel}
        durationInFrames={COMPOSITION_PRESETS.holdOrdersReel.durationInFrames}
        fps={COMPOSITION_PRESETS.holdOrdersReel.fps}
        width={COMPOSITION_PRESETS.holdOrdersReel.width}
        height={COMPOSITION_PRESETS.holdOrdersReel.height}
      />

      {/* 9. Reel Vertical 9:16 - Owner Dashboard y Navegación Contextual */}
      <Composition
        id={COMPOSITION_PRESETS.ownerDashboardReel.id}
        component={OwnerDashboardReel}
        durationInFrames={COMPOSITION_PRESETS.ownerDashboardReel.durationInFrames}
        fps={COMPOSITION_PRESETS.ownerDashboardReel.fps}
        width={COMPOSITION_PRESETS.ownerDashboardReel.width}
        height={COMPOSITION_PRESETS.ownerDashboardReel.height}
      />

      {/* 10. Reel Vertical 9:16 - Semana 3 Martes: Anulaciones con PIN y Auditoría DGI */}
      <Composition
        id={COMPOSITION_PRESETS.voidAuditReel.id}
        component={VoidAuditReel}
        durationInFrames={COMPOSITION_PRESETS.voidAuditReel.durationInFrames}
        fps={COMPOSITION_PRESETS.voidAuditReel.fps}
        width={COMPOSITION_PRESETS.voidAuditReel.width}
        height={COMPOSITION_PRESETS.voidAuditReel.height}
      />

      {/* 11. Reel Vertical 9:16 - Semana 3 Jueves: Cobro Multimoneda y Vuelto Exacto */}
      <Composition
        id={COMPOSITION_PRESETS.multiCurrencyReel.id}
        component={MultiCurrencyReel}
        durationInFrames={COMPOSITION_PRESETS.multiCurrencyReel.durationInFrames}
        fps={COMPOSITION_PRESETS.multiCurrencyReel.fps}
        width={COMPOSITION_PRESETS.multiCurrencyReel.width}
        height={COMPOSITION_PRESETS.multiCurrencyReel.height}
      />

      {/* 12. Reel Vertical 9:16 - Semana 3 Viernes: Kardex y Movimiento de Stock */}
      <Composition
        id={COMPOSITION_PRESETS.kardexAuditReel.id}
        component={KardexAuditReel}
        durationInFrames={COMPOSITION_PRESETS.kardexAuditReel.durationInFrames}
        fps={COMPOSITION_PRESETS.kardexAuditReel.fps}
        width={COMPOSITION_PRESETS.kardexAuditReel.width}
        height={COMPOSITION_PRESETS.kardexAuditReel.height}
      />
    </>
  );
};
