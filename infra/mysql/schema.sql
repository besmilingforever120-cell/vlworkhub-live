CREATE DATABASE IF NOT EXISTS vlworkhub;
USE vlworkhub;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Admin', 'Manager', 'Employee', 'HR', 'IT') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  status VARCHAR(100),
  program VARCHAR(255),
  primary_contact VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  client_id INT,
  staff_id INT,
  note_text TEXT,
  visibility VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  severity VARCHAR(100),
  reported_by VARCHAR(255),
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  owner_name VARCHAR(255),
  storage_path VARCHAR(255),
  due_date DATE,
  requires_signature VARCHAR(20),
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_signatures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  document_id INT NOT NULL,
  signer_name VARCHAR(255),
  status VARCHAR(100),
  signed_at DATETIME NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  job_title VARCHAR(255),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  audience VARCHAR(255),
  publish_date DATE,
  start_date DATE,
  end_date DATE,
  priority VARCHAR(100),
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  assigned_to VARCHAR(255),
  due_date DATE,
  status VARCHAR(100),
  priority VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_user_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  task_id INT NOT NULL,
  user_name VARCHAR(255),
  status VARCHAR(100),
  completed_on DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  audience VARCHAR(255),
  delivery_mode VARCHAR(100),
  content_url VARCHAR(255),
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255),
  training_id INT NOT NULL,
  assignee_name VARCHAR(255),
  due_date DATE,
  survey_url VARCHAR(255),
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_completions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  assignment_id INT NOT NULL,
  user_name VARCHAR(255),
  progress_percent INT,
  completed_on DATETIME NULL,
  last_position_seconds INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  url VARCHAR(255),
  due_date DATE,
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255),
  survey_id INT NOT NULL,
  assignee_name VARCHAR(255),
  due_date DATE,
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_completions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  assignment_id INT NOT NULL,
  user_name VARCHAR(255),
  completed_on DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mileage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  trip_date DATE,
  employee_name VARCHAR(255),
  vehicle_id VARCHAR(100),
  distance_km DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  plate_number VARCHAR(100),
  status VARCHAR(100),
  assigned_location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  relation VARCHAR(100),
  phone VARCHAR(100),
  employee_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS safety_checklists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  completed_by VARCHAR(255),
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (organization_id, full_name, email, password_hash, role)
VALUES (1, 'Platform Admin', 'admin@vlworkhub.ca', '$2b$12$SMomhTA.EZEoShAcBNI2y.racMazlNVxYp3zkSi1K6KbXAOWBbvei', 'Admin')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);
