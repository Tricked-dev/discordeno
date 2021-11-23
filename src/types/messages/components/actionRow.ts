import { ButtonComponent } from "./buttonComponent.ts";
import { SelectMenuComponent } from "./selectMenu.ts";
import { ModalComponent } from "./modals.ts";

/** https://discord.com/developers/docs/interactions/message-components#actionrow */
export interface ActionRow {
  /** Action rows are a group of buttons. */
  type: 1;
  /** The components in this row */
  components:
    | [SelectMenuComponent | ButtonComponent | ModalComponent]
    | [ButtonComponent, ButtonComponent]
    | [ButtonComponent, ButtonComponent, ButtonComponent]
    | [ButtonComponent, ButtonComponent, ButtonComponent, ButtonComponent]
    | [ButtonComponent, ButtonComponent, ButtonComponent, ButtonComponent, ButtonComponent];
}
