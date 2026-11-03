// Corte de mp3 sem decodificar (só servidor): separa os quadros MPEG e junta os que caem no
// intervalo pedido. Precisão de um quadro (~26 ms a 44,1 kHz), suficiente para mandar cada trecho
// da narração pro avatar. Sem ffmpeg, que a função da Vercel não tem.

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

interface Frame {
  offset: number;
  length: number;
  start: number;
  duration: number;
}

function id3Size(buf: Buffer): number {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return 0;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return 10 + size + (buf[5] & 0x10 ? 10 : 0);
}

export function mp3Frames(buf: Buffer): Frame[] {
  const frames: Frame[] = [];
  let pos = id3Size(buf);
  let t = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++; // lixo entre quadros: procura o próximo sincronismo
      continue;
    }
    const version = (buf[pos + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[pos + 1] >> 1) & 3; // 1 = Layer III
    const bitrateIdx = buf[pos + 2] >> 4;
    const srIdx = (buf[pos + 2] >> 2) & 3;
    const padding = (buf[pos + 2] >> 1) & 1;
    if (version === 1 || layer !== 1 || srIdx === 3 || !SAMPLE_RATES[version]) {
      pos++;
      continue;
    }
    const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx];
    if (!kbps) {
      pos++;
      continue;
    }
    const sr = SAMPLE_RATES[version][srIdx];
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / sr) + padding;
    if (length < 4 || pos + length > buf.length) break;
    const duration = samples / sr;
    // quadro de cabeçalho Xing/Info (LAME): guarda a duração do arquivo inteiro; num trecho
    // cortado ele mentiria a duração, então não entra (mas o tempo dele conta, para não deslocar)
    const tag = buf.toString("latin1", pos + 4, Math.min(pos + 40, buf.length));
    const header = frames.length === 0 && (tag.includes("Xing") || tag.includes("Info"));
    if (!header) frames.push({ offset: pos, length, start: t, duration });
    t += duration;
    pos += length;
  }
  return frames;
}

/** Duração do mp3 em segundos (soma dos quadros). */
export function mp3Duration(buf: Buffer): number {
  const f = mp3Frames(buf);
  return f.length ? f[f.length - 1].start + f[f.length - 1].duration : 0;
}

/** Trecho [start, end) do mp3 (em segundos), cortado na fronteira dos quadros. */
export function sliceMp3(buf: Buffer, start: number, end: number): Buffer {
  const parts = mp3Frames(buf)
    .filter((f) => f.start + f.duration / 2 >= start && f.start + f.duration / 2 < end)
    .map((f) => buf.subarray(f.offset, f.offset + f.length));
  if (!parts.length) throw new Error(`Trecho vazio da narração (${start.toFixed(2)}–${end.toFixed(2)}s).`);
  return Buffer.concat(parts);
}
