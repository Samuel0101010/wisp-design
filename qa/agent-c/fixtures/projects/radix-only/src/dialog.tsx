import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"

export function MyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg">
          <Dialog.Title>Confirm</Dialog.Title>
          <Dialog.Description>Are you sure?</Dialog.Description>
          <Dialog.Close>Cancel</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
