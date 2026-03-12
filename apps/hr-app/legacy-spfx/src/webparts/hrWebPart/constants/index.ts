/** Department choices (from your list) */
export const departmentOptions = [
  { key: 'Admin - 001', text: 'Admin - 001' },
  { key: 'Transportation - 002', text: 'Transportation - 002' },
  { key: 'Community Inclusion - 003', text: 'Community Inclusion - 003' },
  { key: 'VITAL - 004', text: 'VITAL - 004' },
  { key: 'Woodshop - 005', text: 'Woodshop - 005' },
  { key: 'Community Employment - 006', text: 'Community Employment - 006' },
  { key: 'Community Work - 007', text: 'Community Work - 007' },
  { key: 'Venture Connections - 008', text: 'Venture Connections - 008' },
  { key: 'Cycle Cycle - 009', text: 'Cycle Cycle - 009' },
  { key: 'E-Waste - 012', text: 'E-Waste - 012' },
  { key: 'Life Skills - 014', text: 'Life Skills - 014' },
  { key: 'ACT - 015', text: 'ACT - 015' },
  { key: 'Armstrong Outreach - 016', text: 'Armstrong Outreach - 016' },
  { key: 'Centrepoint - 100', text: 'Centrepoint - 100' },
  { key: 'Female Cluster - 110', text: 'Female Cluster - 110' },
  { key: 'Willow House - 130', text: 'Willow House - 130' },
  { key: 'Hawthorn House - 140', text: 'Hawthorn House - 140' },
  { key: 'Lower Hawthorn - 150', text: 'Lower Hawthorn - 150' },
  { key: 'Willow Suite - 160', text: 'Willow Suite - 160' },
  { key: 'Cedar House - 170', text: 'Cedar House - 170' },
  { key: 'Mulberry House - R10', text: 'Mulberry House - R10' },
  { key: 'Dobie House - R11', text: 'Dobie House - R11' },
  { key: 'Home Share - 200', text: 'Home Share - 200' },
  { key: 'Lunch Program - K14', text: 'Lunch Program - K14' }
];

export const categoryOptions = [
  { key: 'Policy', text: 'Policy', color: '#3b82f6' },
  { key: 'Form', text: 'Form', color: '#10b981' },
  { key: 'Contract', text: 'Contract', color: '#f59e0b' },
  { key: 'Training', text: 'Training', color: '#8b5cf6' },
  { key: 'Other', text: 'Other', color: '#6b7280' }
];

// Enhanced status options
export const statusOptions = [
  { key: 'Draft', text: 'Draft', color: '#6b7280' },
  { key: 'Pending Review', text: 'Pending Review', color: '#f59e0b' },
  { key: 'Pending Signature', text: 'Pending Signature', color: '#3b82f6' },
  { key: 'Signed', text: 'Signed', color: '#10b981' },
  { key: 'Archived', text: 'Archived', color: '#6b7280' }
];

// Internal field names (change here only if your list uses different internal names)
export const COL = {
  Description: 'Description',
  Department: 'Department',
  Category: 'Category',
  DueDate: 'DueDate',
  RequiresSignature: 'RequiresSignature',
  SignatureImage:'SignatureImage',
  Status: 'Status',
  Signed: 'Signed'
};