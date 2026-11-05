import React from 'react';
import { Series, Audio, staticFile } from 'remotion';
import { BlindAuditTerminalScene } from '../scenes/blind_audit/BlindAuditTerminalScene';
import { BlindAuditTicketScene } from '../scenes/blind_audit/BlindAuditTicketScene';
import { BlindAuditOutroScene } from '../scenes/blind_audit/BlindAuditOutroScene';

export const BlindAuditReel: React.FC = () => {
  return (
    <Series>
      {/* Escenas 1, 2 y 3 continuas en la misma terminal MIRAY Q80 (f0..f600 - 20.0s)
          Cero flashes blancos ni reinicios de ventana entre el hook (f0..f45),
          el corte de atención (f45..f300) y el conteo físico a ciegas (f300..f600). */}
      <Series.Sequence durationInFrames={600}>
        <Series>
          {/* Audio Escenas 1+2 (f0..f300): 275f voz + 25f padding */}
          <Series.Sequence durationInFrames={300}>
            <Audio src={staticFile('audio/blind_1_hook.mp3')} volume={1} />
          </Series.Sequence>
          {/* Audio Escena 3 (f300..f600): 272f voz + 28f padding */}
          <Series.Sequence durationInFrames={300}>
            <Audio src={staticFile('audio/blind_2_count.mp3')} volume={1} />
          </Series.Sequence>
        </Series>
        <BlindAuditTerminalScene />
      </Series.Sequence>

      {/* Escena 4: Ticket Térmico 58mm Corte X (f600..f900 - 10.0s). Audio: 271f + 29f padding */}
      <Series.Sequence durationInFrames={300}>
        <Audio src={staticFile('audio/blind_3_ticket.mp3')} volume={1} />
        <BlindAuditTicketScene />
      </Series.Sequence>

      {/* Escena 5: Cierre Canónico NHILOS POS CTA (f900..f1140 - 8.0s). Audio: 226f + 14f padding */}
      <Series.Sequence durationInFrames={240}>
        <Audio src={staticFile('audio/blind_4_outro.mp3')} volume={1} />
        <BlindAuditOutroScene />
      </Series.Sequence>
    </Series>
  );
};
