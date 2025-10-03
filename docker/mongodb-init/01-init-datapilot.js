// MongoDB initialization script for DataPilot
// This script creates the application database and user

// Create the application user in the admin database
db = db.getSiblingDB('admin');
db.createUser({
  user: 'datapilot',
  pwd: 'datapilot123',
  roles: [
    {
      role: 'readWrite',
      db: 'datapilot'
    },
    {
      role: 'readWrite',
      db: 'datapilot_agent'
    }
  ]
});

// Switch to the datapilot database
db = db.getSiblingDB('datapilot');

// Create the agent checkpoint database
db = db.getSiblingDB('datapilot_agent');

// Create collections for LangGraph checkpoints
db.createCollection('workflow_state_checkpoint');
db.createCollection('workflow_state_writes');
print('DataPilot MongoDB initialization completed successfully');
