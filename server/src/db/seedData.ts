import type { Agent, Priority, TicketStatus } from '../models/ticket.js';

export const SEED_AGENTS: readonly Agent[] = [
  { id: 'agent-priya', name: 'Priya Sharma', email: 'priya.sharma@helpdesk.example' },
  { id: 'agent-marcus', name: 'Marcus Chen', email: 'marcus.chen@helpdesk.example' },
];

export interface SeedTicket {
  title: string;
  customerName: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assignedAgentId: string | null;
  /** Minutes before seeding time that the ticket was created. The SLA deadline derives from this. */
  createdMinutesAgo: number;
}

const PRIYA = 'agent-priya';
const MARCUS = 'agent-marcus';

/**
 * Relative creation times are chosen so the queue demonstrates every ordering rule.
 * SLA windows: URGENT 120 min, NORMAL and LOW 1440 min.
 */
export const SEED_TICKETS: readonly SeedTicket[] = [
  // Overdue: severely overdue NORMAL outranks slightly overdue URGENT.
  { title: 'VPN disconnects every few minutes for the whole finance team', customerName: 'Northwind Traders', description: 'Since Monday the VPN client drops roughly every 10 minutes. Month-end close is blocked.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 1800 },
  { title: 'Outbound email rejected by mail relay', customerName: 'Globex Logistics', description: 'All outbound messages bounce with "550 relay not permitted". Customers are not receiving invoices.', priority: 'URGENT', status: 'IN_PROGRESS', assignedAgentId: PRIYA, createdMinutesAgo: 250 },
  { title: 'Request for a second keyboard at hot desk 14', customerName: 'Umbrella Health', description: 'The shared hot desk only has one keyboard; two staff share it on Tuesdays.', priority: 'LOW', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 1560 },
  // Overdue by exactly 60 minutes: URGENT and NORMAL tie on duration, so priority decides.
  { title: 'Point-of-sale terminals offline at the downtown store', customerName: 'Blue Bottle Retail', description: 'Three of four POS terminals cannot reach the payment gateway. Store is taking cash only.', priority: 'URGENT', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 180 },
  { title: 'Shared calendar not syncing to mobile devices', customerName: 'Initech', description: 'Sales team calendars stopped syncing to phones after the weekend update.', priority: 'NORMAL', status: 'IN_PROGRESS', assignedAgentId: MARCUS, createdMinutesAgo: 1500 },
  { title: 'New hire cannot access shared project drive', customerName: 'Stark Industries', description: 'Onboarding for two engineers is stalled because the Projects share denies access.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: PRIYA, createdMinutesAgo: 1490 },
  { title: "Laptop won't boot before client demo", customerName: 'Acme Corporation', description: 'Laptop shows a black screen after the logo. The client demo starts this afternoon.', priority: 'URGENT', status: 'OPEN', assignedAgentId: PRIYA, createdMinutesAgo: 130 },
  { title: 'Replacement badge reader not recognising cards', customerName: 'Wayne Enterprises', description: 'Badge reader on floor 3 rejects every card since it was swapped out.', priority: 'LOW', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 1445 },

  // On time, URGENT: ordered by time remaining.
  { title: 'CEO cannot join board call — headset not detected', customerName: 'Hooli', description: 'Board meeting in 20 minutes. Headset works on other machines.', priority: 'URGENT', status: 'IN_PROGRESS', assignedAgentId: PRIYA, createdMinutesAgo: 110 },
  { title: 'Warehouse label printer jammed during dispatch', customerName: 'Globex Logistics', description: 'Afternoon dispatch cannot print shipping labels.', priority: 'URGENT', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 95 },
  { title: 'Ransomware warning on reception PC', customerName: 'Umbrella Health', description: 'Pop-up demanding payment appeared. Machine has been unplugged from the network.', priority: 'URGENT', status: 'IN_PROGRESS', assignedAgentId: MARCUS, createdMinutesAgo: 75 },
  { title: 'Payroll export failing before cut-off', customerName: 'Initech', description: 'Payroll system throws a timeout on export. Payroll cut-off is 5pm today.', priority: 'URGENT', status: 'OPEN', assignedAgentId: PRIYA, createdMinutesAgo: 40 },
  { title: 'Website checkout returns error 502', customerName: 'Blue Bottle Retail', description: 'Online checkout fails intermittently; about one in three orders are lost.', priority: 'URGENT', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 8 },

  // On time, NORMAL: ordered by time remaining.
  { title: 'Conference room display will not mirror laptops', customerName: 'Stark Industries', description: 'Room "Jupiter" TV only shows "no signal" over HDMI and wireless.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 1420 },
  { title: 'Password reset emails arriving late', customerName: 'Acme Corporation', description: 'Self-service reset emails take over an hour to arrive.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 1380 },
  { title: 'Install design software for marketing intern', customerName: 'Hooli', description: 'Intern starts Monday and needs the standard design suite.', priority: 'NORMAL', status: 'IN_PROGRESS', assignedAgentId: PRIYA, createdMinutesAgo: 1200 },
  { title: 'Slow Wi-Fi in the east wing', customerName: 'Wayne Enterprises', description: 'Speed tests show under 5 Mbps near the east stairwell.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 960 },
  { title: 'Scanner saves documents to the wrong folder', customerName: 'Northwind Traders', description: 'Scan-to-folder saves to the old accounts share.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 720 },
  { title: 'Can I get a bigger monitor?', customerName: 'Initech', description: 'Working with large spreadsheets all day; a 27" monitor would help.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 600 },
  { title: 'Teams notifications not showing on desktop', customerName: 'Globex Logistics', description: 'Desktop notifications stopped after reinstalling the app.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: PRIYA, createdMinutesAgo: 420 },
  { title: 'Set up shared mailbox for support@ alias', customerName: 'Blue Bottle Retail', description: 'Customer service team needs a shared mailbox with three members.', priority: 'NORMAL', status: 'IN_PROGRESS', assignedAgentId: MARCUS, createdMinutesAgo: 300 },
  { title: 'Excel crashes when opening pivot tables', customerName: 'Stark Industries', description: 'Reproducible crash on the quarterly forecast workbook.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 180 },
  { title: 'Request access to analytics dashboard', customerName: 'Hooli', description: 'Product manager needs read access to the usage dashboard.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: PRIYA, createdMinutesAgo: 90 },
  { title: 'Docking station not charging laptop', customerName: 'Acme Corporation', description: 'Laptop runs on battery while docked; dock lights are on.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 30 },
  { title: 'Printer on floor 2 printing blank pages', customerName: 'Umbrella Health', description: 'Toner was replaced last week; pages still come out blank.', priority: 'NORMAL', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 12 },

  // On time, LOW.
  { title: 'Update email signature template', customerName: 'Northwind Traders', description: 'New brand colours need to be reflected in the signature.', priority: 'LOW', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 1300 },
  { title: 'Label cables under reception desk', customerName: 'Wayne Enterprises', description: 'Tidy-up request ahead of an office visit next month.', priority: 'LOW', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 1000 },
  { title: 'Request for ergonomic mouse', customerName: 'Initech', description: 'Wrist strain; asking for a vertical mouse.', priority: 'LOW', status: 'IN_PROGRESS', assignedAgentId: PRIYA, createdMinutesAgo: 800 },
  { title: 'Add team photos to intranet directory', customerName: 'Hooli', description: 'HR provided new headshots for the directory.', priority: 'LOW', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 480 },
  { title: 'Rename shared folder "Misc" to "Archive"', customerName: 'Globex Logistics', description: 'Housekeeping request from the operations lead.', priority: 'LOW', status: 'OPEN', assignedAgentId: MARCUS, createdMinutesAgo: 240 },
  { title: 'Spare phone charger for meeting room', customerName: 'Blue Bottle Retail', description: 'USB-C charger requested for the boardroom.', priority: 'LOW', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 60 },
  { title: 'Bookmark HR portal on shared kiosk browsers', customerName: 'Stark Industries', description: 'Kiosk browsers should open the HR portal by default.', priority: 'LOW', status: 'OPEN', assignedAgentId: null, createdMinutesAgo: 15 },

  // Resolved: never overdue, always at the bottom of the queue.
  { title: 'Monitor flickering after driver update', customerName: 'Acme Corporation', description: 'Rolled back the display driver; flicker resolved.', priority: 'NORMAL', status: 'RESOLVED', assignedAgentId: PRIYA, createdMinutesAgo: 2900 },
  { title: 'Server room temperature alarm', customerName: 'Wayne Enterprises', description: 'Air conditioning unit reset; temperature back to normal.', priority: 'URGENT', status: 'RESOLVED', assignedAgentId: MARCUS, createdMinutesAgo: 400 },
  { title: 'Unlock account after failed logins', customerName: 'Northwind Traders', description: 'Account unlocked and MFA re-enrolled.', priority: 'URGENT', status: 'RESOLVED', assignedAgentId: PRIYA, createdMinutesAgo: 60 },
  { title: 'Install PDF reader on accounting laptops', customerName: 'Initech', description: 'Deployed via software centre.', priority: 'LOW', status: 'RESOLVED', assignedAgentId: MARCUS, createdMinutesAgo: 2000 },
  { title: 'Guest Wi-Fi password rotation', customerName: 'Hooli', description: 'Password rotated and posted at reception.', priority: 'NORMAL', status: 'RESOLVED', assignedAgentId: PRIYA, createdMinutesAgo: 700 },
  { title: 'Broken laptop hinge replacement', customerName: 'Umbrella Health', description: 'Loan laptop provided; hinge replaced under warranty.', priority: 'NORMAL', status: 'RESOLVED', assignedAgentId: MARCUS, createdMinutesAgo: 3100 },
  { title: 'Add new starter to distribution lists', customerName: 'Globex Logistics', description: 'Added to all-staff and operations lists.', priority: 'LOW', status: 'RESOLVED', assignedAgentId: null, createdMinutesAgo: 1100 },
  { title: 'Projector bulb replacement in training room', customerName: 'Stark Industries', description: 'Bulb replaced; projector tested.', priority: 'LOW', status: 'RESOLVED', assignedAgentId: PRIYA, createdMinutesAgo: 500 },
];
