import fs from 'fs';
import path from 'path';
import { Trip, User, Shift, EmergencyAlert, CheckIn, ActiveUserSession } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TRIPS_FILE = path.join(DATA_DIR, 'trips.json');
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');
const EMERGENCIES_FILE = path.join(DATA_DIR, 'emergencies.json');
const CHECKINS_FILE = path.join(DATA_DIR, 'check-ins.json');
const ACTIVE_USERS_FILE = path.join(DATA_DIR, 'active-users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize files if they don't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(TRIPS_FILE)) {
  fs.writeFileSync(TRIPS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(SHIFTS_FILE)) {
  fs.writeFileSync(SHIFTS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(EMERGENCIES_FILE)) {
  fs.writeFileSync(EMERGENCIES_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(CHECKINS_FILE)) {
  fs.writeFileSync(CHECKINS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(ACTIVE_USERS_FILE)) {
  fs.writeFileSync(ACTIVE_USERS_FILE, JSON.stringify([], null, 2));
}

// Helper functions
function readJSON<T>(filePath: string): T[] {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

function writeJSON<T>(filePath: string, data: T[]): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}

// User operations
export function getAllUsers(): User[] {
  return readJSON<User>(USERS_FILE);
}

export function getUserById(id: string): User | undefined {
  const users = getAllUsers();
  return users.find(u => u.id === id);
}

export function getUserByEmail(email: string): User | undefined {
  const users = getAllUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function createUser(user: User): User {
  const users = getAllUsers();
  users.push(user);
  writeJSON(USERS_FILE, users);
  return user;
}

export function updateUser(id: string, updates: Partial<User>): User | undefined {
  const users = getAllUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return undefined;
  
  users[index] = { ...users[index], ...updates };
  writeJSON(USERS_FILE, users);
  return users[index];
}

export function deleteUser(id: string): boolean {
  const users = getAllUsers();
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === users.length) return false;
  
  writeJSON(USERS_FILE, filtered);
  return true;
}

// Trip operations
export function getAllTrips(): Trip[] {
  return readJSON<Trip>(TRIPS_FILE);
}

export function getTripById(id: string): Trip | undefined {
  const trips = getAllTrips();
  return trips.find(t => t.id === id);
}

export function getTripsByUserId(userId: string): Trip[] {
  const trips = getAllTrips();
  return trips.filter(t => t.userId === userId);
}

export function createTrip(trip: Trip): Trip {
  const trips = getAllTrips();
  trips.push(trip);
  writeJSON(TRIPS_FILE, trips);
  return trip;
}

export function updateTrip(id: string, updates: Partial<Trip>): Trip | undefined {
  const trips = getAllTrips();
  const index = trips.findIndex(t => t.id === id);
  if (index === -1) return undefined;
  
  trips[index] = { ...trips[index], ...updates };
  writeJSON(TRIPS_FILE, trips);
  return trips[index];
}

export function deleteTrip(id: string): boolean {
  const trips = getAllTrips();
  const filtered = trips.filter(t => t.id !== id);
  if (filtered.length === trips.length) return false;
  
  writeJSON(TRIPS_FILE, filtered);
  return true;
}

// Shift operations
export function getAllShifts(): Shift[] {
  return readJSON<Shift>(SHIFTS_FILE);
}

export function getShiftById(id: string): Shift | undefined {
  const shifts = getAllShifts();
  return shifts.find(s => s.id === id);
}

export function getShiftsByUserId(userId: string): Shift[] {
  const shifts = getAllShifts();
  return shifts.filter(s => s.userId === userId);
}

export function getActiveShifts(): Shift[] {
  const shifts = getAllShifts();
  return shifts.filter(s => !s.endTime && (s.status === 'active' || s.status === 'emergency'));
}

export function getActiveShiftByUserId(userId: string): Shift | undefined {
  const shifts = getAllShifts();
  return shifts.find(s => s.userId === userId && !s.endTime && (s.status === 'active' || s.status === 'emergency'));
}

export function createShift(shift: Shift): Shift {
  const shifts = getAllShifts();
  shifts.push(shift);
  writeJSON(SHIFTS_FILE, shifts);
  return shift;
}

export function updateShift(id: string, updates: Partial<Shift>): Shift | undefined {
  const shifts = getAllShifts();
  const index = shifts.findIndex(s => s.id === id);
  if (index === -1) return undefined;
  
  shifts[index] = { ...shifts[index], ...updates };
  writeJSON(SHIFTS_FILE, shifts);
  return shifts[index];
}

// Emergency operations
export function getAllEmergencies(): EmergencyAlert[] {
  return readJSON<EmergencyAlert>(EMERGENCIES_FILE);
}

export function getUnresolvedEmergencies(): EmergencyAlert[] {
  const emergencies = getAllEmergencies();
  return emergencies.filter(e => !e.resolved);
}

export function createEmergency(emergency: EmergencyAlert): EmergencyAlert {
  const emergencies = getAllEmergencies();
  emergencies.push(emergency);
  writeJSON(EMERGENCIES_FILE, emergencies);
  return emergency;
}

export function updateEmergency(id: string, updates: Partial<EmergencyAlert>): EmergencyAlert | undefined {
  const emergencies = getAllEmergencies();
  const index = emergencies.findIndex(e => e.id === id);
  if (index === -1) return undefined;
  
  emergencies[index] = { ...emergencies[index], ...updates };
  writeJSON(EMERGENCIES_FILE, emergencies);
  return emergencies[index];
}

export function getEmergenciesByShiftId(shiftId: string): EmergencyAlert[] {
  const emergencies = getAllEmergencies();
  return emergencies.filter(e => e.shiftId === shiftId);
}

// Check-in operations
export function getAllCheckIns(): CheckIn[] {
  return readJSON<CheckIn>(CHECKINS_FILE);
}

export function getCheckInsByShiftId(shiftId: string): CheckIn[] {
  const checkIns = getAllCheckIns();
  return checkIns.filter(c => c.shiftId === shiftId);
}

export function createCheckIn(checkIn: CheckIn): CheckIn {
  const checkIns = getAllCheckIns();
  checkIns.push(checkIn);
  writeJSON(CHECKINS_FILE, checkIns);
  return checkIn;
}

// Active user session operations
export function getAllActiveUserSessions(): ActiveUserSession[] {
  return readJSON<ActiveUserSession>(ACTIVE_USERS_FILE);
}

export function getActiveSessionById(id: string): ActiveUserSession | undefined {
  const sessions = getAllActiveUserSessions();
  return sessions.find((session) => session.id === id);
}

export function getActiveSessionByUserId(userId: string): ActiveUserSession | undefined {
  const sessions = getAllActiveUserSessions();
  return sessions.find((session) => session.userId === userId);
}

export function upsertActiveUserSession(session: ActiveUserSession): ActiveUserSession {
  const sessions = getAllActiveUserSessions();
  const indexById = sessions.findIndex((s) => s.id === session.id);
  if (indexById !== -1) {
    sessions[indexById] = { ...sessions[indexById], ...session };
  } else {
    const indexByUserId = sessions.findIndex((s) => s.userId === session.userId);
    if (indexByUserId !== -1) {
      sessions[indexByUserId] = { ...sessions[indexByUserId], ...session };
    } else {
      sessions.push(session);
    }
  }
  writeJSON(ACTIVE_USERS_FILE, sessions);
  return session;
}

export function updateActiveUserSession(
  id: string,
  updates: Partial<ActiveUserSession>,
): ActiveUserSession | undefined {
  const sessions = getAllActiveUserSessions();
  const index = sessions.findIndex((session) => session.id === id);
  if (index === -1) return undefined;
  sessions[index] = { ...sessions[index], ...updates, id: sessions[index].id };
  writeJSON(ACTIVE_USERS_FILE, sessions);
  return sessions[index];
}

export function deleteActiveUserSession(id: string): boolean {
  const sessions = getAllActiveUserSessions();
  const filtered = sessions.filter((session) => session.id !== id);
  if (filtered.length === sessions.length) {
    return false;
  }
  writeJSON(ACTIVE_USERS_FILE, filtered);
  return true;
}

export function deleteActiveSessionByUserId(userId: string): boolean {
  const sessions = getAllActiveUserSessions();
  const filtered = sessions.filter((session) => session.userId !== userId);
  if (filtered.length === sessions.length) {
    return false;
  }
  writeJSON(ACTIVE_USERS_FILE, filtered);
  return true;
}
