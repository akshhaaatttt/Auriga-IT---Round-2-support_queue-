import type { Agent, TicketInput } from '../types/api';
import { Dialog } from './Dialog';
import { TicketForm } from './TicketForm';

interface CreateTicketDialogProps {
  open: boolean;
  agents: readonly Agent[];
  defaultAgentId: string | null;
  onClose: () => void;
  onCreate: (input: TicketInput) => Promise<void>;
}

export function CreateTicketDialog({ open, agents, defaultAgentId, onClose, onCreate }: CreateTicketDialogProps) {
  const initialValues: TicketInput = {
    customerName: '',
    title: '',
    description: '',
    priority: 'NORMAL',
    status: 'OPEN',
    assignedAgentId: defaultAgentId,
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New ticket"
      description="The SLA deadline is set from the priority when the ticket is created."
    >
      <TicketForm
        initialValues={initialValues}
        agents={agents}
        submitLabel="Create ticket"
        onSubmit={onCreate}
        onCancel={onClose}
      />
    </Dialog>
  );
}
