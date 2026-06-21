import type { PdfPageImageInput } from "./parser.ts";

export type DocumentPreviewPage = {
  id: string;
  pageNumber: number;
  mimeType: string;
  imageBase64: string;
  dataUrl: string;
};

export type Point = {
  x: number;
  y: number;
};

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PreviewImageControls = {
  contrast: number;
  brightness: number;
  zoom: number;
};

export type PreviewEnhancementMode = "original" | "enhanced" | "black-text";

export type PreviewPixelEnhancementInput = {
  data: Uint8ClampedArray;
  mode: Exclude<PreviewEnhancementMode, "original">;
};

export function buildPreviewPagesFromPdfImages(
  pageImages: PdfPageImageInput[],
): DocumentPreviewPage[] {
  return pageImages.map((page) => ({
    id: `pdf-page-${page.pageNumber}`,
    pageNumber: page.pageNumber,
    mimeType: page.mimeType,
    imageBase64: page.imageBase64,
    dataUrl: `data:${page.mimeType};base64,${page.imageBase64}`,
  }));
}

export function createPreviewPageFromDataUrl(
  fileName: string,
  dataUrl: string,
): DocumentPreviewPage {
  const [metadata, imageBase64 = ""] = dataUrl.split(",");
  const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] || "image/png";

  return {
    id: `${fileName}-page-1`,
    pageNumber: 1,
    mimeType,
    imageBase64,
    dataUrl,
  };
}

export function normalizeSelectionRect(
  start: Point,
  end: Point,
  bounds: { width: number; height: number },
): NormalizedRect {
  const left = clamp(Math.min(start.x, end.x) / bounds.width);
  const top = clamp(Math.min(start.y, end.y) / bounds.height);
  const right = clamp(Math.max(start.x, end.x) / bounds.width);
  const bottom = clamp(Math.max(start.y, end.y) / bounds.height);

  return {
    x: round4(left),
    y: round4(top),
    width: round4(right - left),
    height: round4(bottom - top),
  };
}

export function normalizedRectToPercentStyle(rect: NormalizedRect) {
  return {
    left: `${round2(rect.x * 100)}%`,
    top: `${round2(rect.y * 100)}%`,
    width: `${round2(rect.width * 100)}%`,
    height: `${round2(rect.height * 100)}%`,
  };
}

export function buildPreviewImageStyle({
  contrast,
  brightness,
  zoom,
}: PreviewImageControls) {
  const safeContrast = clampRange(contrast, 100, 260);
  const safeBrightness = clampRange(brightness, 70, 120);
  const safeZoom = clampRange(zoom, 75, 220);

  return {
    filter: `grayscale(100%) contrast(${safeContrast}%) brightness(${safeBrightness}%)`,
    maxWidth: "none",
    width: `${safeZoom}%`,
  };
}

export function enhancePreviewPixels({
  data,
  mode,
}: PreviewPixelEnhancementInput) {
  const output = new Uint8ClampedArray(data);
  const luminanceValues: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 0) {
      luminanceValues.push(getLuminance(data[index], data[index + 1], data[index + 2]));
    }
  }

  if (luminanceValues.length === 0) {
    return output;
  }

  luminanceValues.sort((left, right) => left - right);
  const background = percentile(luminanceValues, 0.9);
  const faintTextCutoff = Math.max(0, background - 3);

  for (let index = 0; index < output.length; index += 4) {
    const alpha = output[index + 3];
    if (alpha === 0) {
      continue;
    }

    const luminance = getLuminance(output[index], output[index + 1], output[index + 2]);
    const enhancedValue =
      luminance >= faintTextCutoff
        ? 255
        : mode === "black-text"
          ? 0
          : clampByte(255 - (background - luminance) * 22);

    output[index] = enhancedValue;
    output[index + 1] = enhancedValue;
    output[index + 2] = enhancedValue;
    output[index + 3] = alpha;
  }

  return output;
}

export async function createEnhancedPreviewDataUrl(
  page: DocumentPreviewPage,
  mode: Exclude<PreviewEnhancementMode, "original">,
) {
  const image = await loadImage(page.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare enhanced document preview.");
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  imageData.data.set(enhancePreviewPixels({ data: imageData.data, mode }));
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}

export async function readImageFileAsPreviewPage(
  file: File,
): Promise<DocumentPreviewPage> {
  const dataUrl = await readFileAsDataUrl(file);
  return createPreviewPageFromDataUrl(file.name, dataUrl);
}

export async function cropPreviewPageToFile({
  page,
  rect,
  fileName,
}: {
  page: DocumentPreviewPage;
  rect: NormalizedRect;
  fileName: string;
}): Promise<File> {
  const image = await loadImage(page.dataUrl);
  const canvas = document.createElement("canvas");
  const cropX = Math.round(rect.x * image.naturalWidth);
  const cropY = Math.round(rect.y * image.naturalHeight);
  const cropWidth = Math.max(1, Math.round(rect.width * image.naturalWidth));
  const cropHeight = Math.max(1, Math.round(rect.height * image.naturalHeight));
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare highlighted document region.");
  }

  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
      } else {
        reject(new Error("Unable to crop highlighted document region."));
      }
    }, "image/png");
  });

  return new File([blob], fileName, { type: "image/png" });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image preview."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load document preview."));
    image.src = dataUrl;
  });
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function getLuminance(red: number, green: number, blue: number) {
  return Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
}

function percentile(sortedValues: number[], ratio: number) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((sortedValues.length - 1) * ratio)),
  );
  return sortedValues[index];
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
