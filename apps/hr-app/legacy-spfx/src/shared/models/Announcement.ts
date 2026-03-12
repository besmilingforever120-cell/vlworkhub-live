export interface IAnnouncement { 
  Id: number;
  Title: string;
  Body?: string;
  Created: string;
  Author?: { Title: string };
  StartDate?: string;
  EndDate?: string;
  Priority?: string;
}

export interface IAnnouncementUpdate {
  Title: string;
  Body?: string;
  StartDate?: string;
  EndDate?: string;
  Priority: string;
}