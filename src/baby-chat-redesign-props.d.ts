import type { ReactElement } from "react";
import type { BabyChatDraft } from "@/components/baby-chat";

export {};

declare module "@/components/baby-chat" {
  export function BabyChatDrawer(props: {
    open: boolean;
    onOpenChange: (value: boolean) => void;
    context?: string;
    dictatedDraft?: BabyChatDraft | null;
    onDictatedDraftConsumed?: (id: number) => void;
    initialTab?: "chat" | "skills";
  }): ReactElement;
}
