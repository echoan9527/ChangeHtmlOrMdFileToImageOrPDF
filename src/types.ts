export interface CaptureRequest {
  url?: string;
  htmlContent?: string;
  format: 'png' | 'jpeg' | 'pdf';
  fullPage: boolean;
  selector?: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  pdfBreakAvoidSelectors?: string;
  pdfMargin?: string;
  sliceMode?: boolean;
  sliceAspectRatio?: '4:5' | '3:4' | '1:1' | '16:9' | '9:16';
  watermark?: {
    enabled: boolean;
    text: string;
    subText?: string;
    avatar?: string;
    qrCode?: string;
    placement: 'floating' | 'footer' | 'header';
  };
}
