import { BaseSharePointService } from '../core/BaseSharePointService';
import { ITaskUserState, ITaskItem, ITaskWithProgress } from '../../models';

export class TaskUserStateService extends BaseSharePointService {
  private listTitle = 'TaskUserState';

 async setMyTaskStatus(
  taskId: number,
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked',
  currentUserId: number
): Promise<void> {
  console.log(`📝 Setting task ${taskId} status to "${status}" for user ${currentUserId}`);
  
  const existing = await this.get<{ value: any[] }>(
    `${this.baseUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items` +
      `?$filter=(TaskIdId eq ${taskId}) and (UserId eq ${currentUserId})` +
      `&$select=Id,TaskIdId,UserId,Status,CompletedOn,Created,Modified`
  );

  const payload = {
    TaskIdId: taskId,
    UserId: currentUserId,
    Status: status,
    ...(status === 'Completed' ? { CompletedOn: new Date().toISOString() } : {})

  };

  if (existing.value.length > 0) {
    console.log(`✏️ Updating existing TaskUserState record ${existing.value[0].Id}`);
    await this.postWithoutResponse(
      `${this.baseUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items(${existing.value[0].Id})`,
      payload,
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );
  } else {
    console.log(`➕ Creating new TaskUserState record`);
    await this.post<ITaskUserState>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items`,
      payload
    );
  }

  console.log(`✅ TaskUserState updated, now updating main task status...`);
  
  // ✅ This is the critical call - make sure it's being executed
  await this.updateTaskStatusBasedOnUserStates(taskId);
  
  console.log(`✅ Main task status update completed`);
}

/**
 * ✅ Updates the main task's Status based on all user completion states
 */
/**
 * ✅ ENHANCED: Updates task status using CompletedOn dates for verification
 */
private async updateTaskStatusBasedOnUserStates(taskId: number): Promise<void> {
  try {
    console.log(`🔄 Updating task ${taskId} status based on user states...`);
    
    const allStates = await this.getTaskUserStates([taskId]);
    console.log(`📊 Found ${allStates.length} user states:`, allStates);
    
    if (allStates.length === 0) {
      console.log('⚠️ No user states found, skipping update');
      return;
    }

    // ✅ Use CompletedOn to verify completed status
    const totalUsers = allStates.length;
    const completedUsers = allStates.filter(us => 
      us.Status === 'Completed' && us.CompletedOn !== null
    );
    const completedCount = completedUsers.length;
    const inProgressCount = allStates.filter(us => us.Status === 'In Progress').length;
    const blockedCount = allStates.filter(us => us.Status === 'Blocked').length;

    console.log(`📈 Stats: ${completedCount}/${totalUsers} completed, ${inProgressCount} in progress, ${blockedCount} blocked`);
    
    // ✅ Log completion dates for verification
    if (completedUsers.length > 0) {
      console.log('✅ Completed users:', completedUsers.map(u => 
        `${u.UserTitle} (completed: ${u.CompletedOn})`
      ));
    }

    let newStatus: string;

    if (completedCount === totalUsers) {
      newStatus = 'Completed';
      console.log('✅ All users completed → Setting task to Completed');
    } else if (blockedCount > 0) {
      newStatus = 'Blocked';
      console.log('🚫 Some users blocked → Setting task to Blocked');
    } else if (inProgressCount > 0 || completedCount > 0) {
      newStatus = 'In Progress';
      console.log('🔄 Some progress → Setting task to In Progress');
    } else {
      newStatus = 'Not Started';
      console.log('⭕ No progress → Setting task to Not Started');
    }

    console.log(`🔧 Updating task ${taskId} status to: ${newStatus}`);
    const taskListUrl = `${this.baseUrl}/_api/web/lists/getbytitle('Tasks')/items(${taskId})`;
    
    await this.postWithoutResponse(
      taskListUrl,
      { Status: newStatus },
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );

    console.log(`✅ Successfully updated task ${taskId} status to: ${newStatus}`);

  } catch (error) {
    console.error('❌ Error updating task status based on user states:', error);
  }
}

  async getTaskUserStates(taskIds: number[]): Promise<ITaskUserState[]> {
    if (!taskIds.length) return [];

    const filter = taskIds.map(id => `TaskIdId eq ${id}`).join(' or ');
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items` +
      `?$filter=${encodeURIComponent(filter)}` +
      `&$select=Id,TaskIdId,UserId,Status,CompletedOn,Created,Modified` +
      `&$top=1000`;

    try {
      const data = await this.get<{ value: any[] }>(url);

      const userIds = [...new Set(data.value.map(item => item.UserId))];
      const userMap = new Map<number, string>();

      if (userIds.length > 0) {
        const userFilter = userIds.map(id => `Id eq ${id}`).join(' or ');
        const userUrl = `${this.baseUrl}/_api/web/siteusers?$filter=${encodeURIComponent(
          userFilter
        )}&$select=Id,Title`;

        try {
          const usersData = await this.get<{ value: Array<{ Id: number; Title: string }> }>(
            userUrl
          );
          usersData.value.forEach(user => {
            userMap.set(user.Id, user.Title);
          });
        } catch (error) {
          console.warn('Could not fetch user names:', error);
        }
      } 

      return data.value.map(item => ({
        Id: item.Id,
        TaskId: item.TaskIdId,
        UserId: item.UserId,
        UserTitle: userMap.get(item.UserId) || `User ${item.UserId}`,
        Status: item.Status,
        CompletedOn: item.CompletedOn,
        Created: item.Created,
        Modified: item.Modified
      }));
    } catch (error) {
      console.warn('TaskUserState list may not exist:', error);
      return [];
    }
  }

 async enrichTasksWithProgress(
  tasks: ITaskItem[],
  currentUserId: number
): Promise<ITaskWithProgress[]> {
  if (!tasks.length) return [];

  const taskIds = tasks.map(t => t.Id);
  const userStates = await this.getTaskUserStates(taskIds);

  return tasks.map(task => {
    const taskUserStates = userStates.filter(us => us.TaskId === task.Id);
    const myState = taskUserStates.find(us => us.UserId === currentUserId);
    const stats = {
      total: taskUserStates.length,
      completed: taskUserStates.filter(us => us.Status === 'Completed').length,
      inProgress: taskUserStates.filter(us => us.Status === 'In Progress').length,
      notStarted: taskUserStates.filter(us => us.Status === 'Not Started').length,
      blocked: taskUserStates.filter(us => us.Status === 'Blocked').length
    };

    // ✅ NEW: Auto-correct task status based on user states
    let correctedStatus = task.Status;
    if (taskUserStates.length > 0) {
      if (stats.completed === stats.total) {
        correctedStatus = 'Completed';
      } else if (stats.blocked > 0) {
        correctedStatus = 'Blocked';
      } else if (stats.inProgress > 0 || stats.completed > 0) {
        correctedStatus = 'In Progress';
      } else {
        correctedStatus = 'Not Started';
      }

      // ✅ If status is wrong, trigger background update
      if (correctedStatus !== task.Status) {
        console.log(`⚠️ Task ${task.Id} status mismatch: "${task.Status}" should be "${correctedStatus}"`);
        // Fire and forget - don't wait for this
        this.updateTaskStatusBasedOnUserStates(task.Id).catch(err => 
          console.error('Background status update failed:', err)
        );
      }
    }

    return {
      ...task,
      Status: correctedStatus, // ✅ Use corrected status
      userStates: taskUserStates,
      myStatus: myState?.Status,
      completionStats: stats
    } as ITaskWithProgress;
  });
}
}