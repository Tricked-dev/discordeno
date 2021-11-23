import { MessageComponentTypes } from "./messageComponentTypes.ts";

export enum TextStyleTypes {
  /** Intended for short single-line text. */
  Short = 1,
  /** Intended for much longer inputs. */
  Paragraph,
}

export interface ModalComponent {
  type: MessageComponentTypes.InputText;
  style: TextStyleTypes;
  customId: string;
  label: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}
