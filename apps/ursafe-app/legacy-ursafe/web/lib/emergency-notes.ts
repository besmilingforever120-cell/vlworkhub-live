type ParsedResolution = {
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  employeeSafe?: string;
  canResumeWork?: string;
  actionsTaken?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
};

export type ParsedEmergencyNotes = ParsedResolution & {
  notes: string;
};

export const parseEmergencyNotes = (raw?: string | null): ParsedEmergencyNotes => {
  if (!raw) {
    return { notes: '' };
  }

  try {
    const parsed = JSON.parse(raw) as {
      initialNotes?: string;
      notes?: string;
      resolution?: ParsedResolution;
    };

    if (parsed && typeof parsed === 'object') {
      const initialNotes = typeof parsed.initialNotes === 'string' ? parsed.initialNotes : '';
      const fallbackNotes = typeof parsed.notes === 'string' ? parsed.notes : '';
      const resolution = parsed.resolution && typeof parsed.resolution === 'object'
        ? parsed.resolution
        : undefined;

      return {
        notes: initialNotes || fallbackNotes || raw,
        resolvedAt: resolution?.resolvedAt,
        resolvedBy: resolution?.resolvedBy,
        resolution: resolution?.resolution,
        employeeSafe: resolution?.employeeSafe,
        canResumeWork: resolution?.canResumeWork,
        actionsTaken: resolution?.actionsTaken,
        followUpRequired: resolution?.followUpRequired,
        followUpNotes: resolution?.followUpNotes,
      };
    }
  } catch {
    // Not JSON. Use raw notes.
  }

  return { notes: raw };
};
