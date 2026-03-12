import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchHomeDashboardData, saveHomeDashboardData } from '../services/homeDashboardDataService.js'
import { fetchSiteUsers, saveSiteUsers } from '../services/siteAdministratorDataService.js'

function dateKey(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeNumericId(value) {
  const normalizedValue = Number(value)
  return Number.isFinite(normalizedValue) ? normalizedValue : null
}

function buildCalendarDays(monthDate) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const startWeekday = monthStart.getDay()
  const totalDays = monthEnd.getDate()
  const calendarCells = []

  for (let index = 0; index < startWeekday; index += 1) {
    calendarCells.push(null)
  }

  for (let day = 1; day <= totalDays; day += 1) {
    calendarCells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
  }

  return calendarCells
}

function buildEmptyUserFormValues(overrides = {}) {
  return {
    firstName: '',
    lastName: '',
    email: '',
    role: 'employee',
    department: '',
    managerId: '',
    startDate: '',
    notes: '',
    temporaryPassword: '',
    autoGeneratePassword: true,
    mustChangePassword: true,
    resetPassword: false,
    generateNewPassword: true,
    isActive: true,
    ...overrides,
  }
}

function buildEmptyGroupFormValues(overrides = {}) {
  return {
    name: '',
    description: '',
    managerId: '',
    userIds: [],
    ...overrides,
  }
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
}

const ROLE_OPTIONS = ['super_admin', 'admin', 'manager', 'employee']

function normalizeRole(rawRole) {
  const value = (rawRole ?? '').toString().trim().toLowerCase()
  if (!value) {
    return 'employee'
  }

  if (value.includes('super')) {
    return 'super_admin'
  }

  if (['admin', 'manager', 'employee'].includes(value)) {
    return value
  }

  return 'employee'
}

function formatRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] ?? 'Employee'
}

function generateTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%'
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function isArchivedUser(user) {
  const normalizedStatus = (user?.status ?? '').toString().toLowerCase()
  return normalizedStatus === 'archived' || normalizedStatus === 'disabled' || user?.isActive === false
}

function buildArchivedEmail(email, userId) {
  const baseEmail = email ?? ''
  const suffix = `.archived.${userId}.${Date.now()}`
  const maxPrefixLength = Math.max(1, 255 - suffix.length)
  const trimmedEmail = baseEmail.length > maxPrefixLength ? baseEmail.slice(0, maxPrefixLength) : baseEmail
  return `${trimmedEmail}${suffix}`
}

function extractOriginalEmail(email) {
  const marker = '.archived.'
  const index = (email ?? '').indexOf(marker)
  return index > 0 ? email.slice(0, index) : email
}

function getDisplayEmail(user) {
  if (!isArchivedUser(user)) {
    return user?.email ?? ''
  }

  return extractOriginalEmail(user?.email ?? '')
}

const SITE_ADMINISTRATOR_PAGES = ['Emplyees Management', 'Groups', 'Departments']

const SITE_ADMIN_PANEL_DESCRIPTIONS = {
  'Emplyees Management': 'Manage employee records, roles, and onboarding workflows.',
  Groups: 'Manage access groups and permission assignments for your teams.',
  Departments: 'Manage department profiles and ownership across the organization.',
}

function HomeDashboard() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }

    const savedThemeMode = window.localStorage.getItem('sv-theme-mode')
    return savedThemeMode === 'dark' ? 'dark' : 'light'
  })
  const [now, setNow] = useState(new Date())
  const [isQuickStartCollapsed, setIsQuickStartCollapsed] = useState(false)
  const [selectedQuickStartLabel, setSelectedQuickStartLabel] = useState('Home')
  const [activeSectionLabel, setActiveSectionLabel] = useState('Home')
  const [announcementQuery, setAnnouncementQuery] = useState('')
  const [activeMonth, setActiveMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(now)
  const [isCalendarDayFocused, setIsCalendarDayFocused] = useState(false)
  const calendarAutoSyncMonthKeyRef = useRef('')
  const [dashboardData, setDashboardData] = useState(null)
  const [announcementRecords, setAnnouncementRecords] = useState([])
  const [eventRecords, setEventRecords] = useState({})
  const [incidentRecords, setIncidentRecords] = useState([])
  const [liveAlerts, setLiveAlerts] = useState([
    { id: 1, level: 'info', message: 'Live monitoring connected.', time: now.toLocaleTimeString() },
  ])
  const [activeHomeExpandedView, setActiveHomeExpandedView] = useState(null)
  const [activeHomeForm, setActiveHomeForm] = useState(null)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [editingCalendarTarget, setEditingCalendarTarget] = useState(null)
  const [activeSiteAdminPanel, setActiveSiteAdminPanel] = useState('Emplyees Management')
  const [announcementForm, setAnnouncementForm] = useState({
    category: 'Agency',
    title: '',
    timestamp: '',
  })
  const [calendarForm, setCalendarForm] = useState({
    date: dateKey(now),
    event: '',
  })
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [siteUsers, setSiteUsers] = useState([])
  const [isSiteUsersLoading, setIsSiteUsersLoading] = useState(true)
  const [siteUsersError, setSiteUsersError] = useState('')
  const [editingUserId, setEditingUserId] = useState(null)
  const [userFormValues, setUserFormValues] = useState(() => buildEmptyUserFormValues())
  const [isSavingUser, setIsSavingUser] = useState(false)
  const [siteUserMessage, setSiteUserMessage] = useState({ type: '', text: '' })
  const [isUserFormVisible, setIsUserFormVisible] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [userStatusFilter, setUserStatusFilter] = useState('active')
  const [lastGeneratedPassword, setLastGeneratedPassword] = useState('')
  const [groups, setGroups] = useState([])
  const [groupFormValues, setGroupFormValues] = useState(() => buildEmptyGroupFormValues())
  const [isGroupFormVisible, setIsGroupFormVisible] = useState(false)
  const [isSavingGroup, setIsSavingGroup] = useState(false)
  const [groupMessage, setGroupMessage] = useState({ type: '', text: '' })
  const [activeGroupMembersGroupId, setActiveGroupMembersGroupId] = useState(null)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editGroupFormValues, setEditGroupFormValues] = useState(() => buildEmptyGroupFormValues())
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false)

  const quickStartItems = dashboardData?.quickStartItems ?? []
  const rotatingAlerts = dashboardData?.rotatingAlerts ?? []
  const spotlight = dashboardData?.spotlight ?? {
    title: 'Care Spotlight',
    description:
      'Team members can pin success stories, client milestones, and community highlights directly to the home screen.',
  }
  const systemLabel = dashboardData?.systemLabel ?? 'ShareVision Style Dashboard'
  const organizationName =
    dashboardData?.organizationName ?? 'Vernon & District Association for Community Living'
  const dashboardUserName = dashboardData?.userName ?? 'Care Team User'
  const displayUserName = user?.name ?? dashboardUserName

  useEffect(() => {
    const rootElement = document.documentElement
    rootElement.setAttribute('data-theme', themeMode)
    window.localStorage.setItem('sv-theme-mode', themeMode)
  }, [themeMode])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    function handleGlobalClick(event) {
      const targetElement = event.target instanceof Element ? event.target : null

      if (targetElement?.closest('.sv-calendar-day')) {
        return
      }

      setIsCalendarDayFocused(false)
    }

    document.addEventListener('click', handleGlobalClick)
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [])

  useEffect(() => {
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`
    if (calendarAutoSyncMonthKeyRef.current === currentMonthKey) {
      return
    }

    calendarAutoSyncMonthKeyRef.current = currentMonthKey
    setActiveMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(new Date(now))
    setIsCalendarDayFocused(false)
  }, [now])

  useEffect(() => {
    let isActive = true

    async function loadDashboardData() {
      setIsLoadingData(true)
      setDataError('')

      try {
        const loadedDashboardData = await fetchHomeDashboardData()
        if (!isActive) {
          return
        }

        setDashboardData(loadedDashboardData)
        setAnnouncementRecords(loadedDashboardData.announcements ?? [])
        setEventRecords(loadedDashboardData.eventsByDate ?? {})
        setIncidentRecords(loadedDashboardData.incidents ?? [])
      } catch {
        if (!isActive) {
          return
        }

        setDataError('Unable to load JSON data right now. Verify /public/mock/home-dashboard.json')
      } finally {
        if (isActive) {
          setIsLoadingData(false)
        }
      }
    }

    loadDashboardData()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadSiteUsers() {
      setIsSiteUsersLoading(true)
      setSiteUsersError('')

      try {
        const payload = await fetchSiteUsers()
        if (!isMounted) {
          return
        }

        const normalizedUsers = (Array.isArray(payload) ? payload : []).map((user) => {
          const rawStatus = (user?.status ?? '').toString().toLowerCase()
          const normalizedStatus = rawStatus === 'archived' || rawStatus === 'disabled' ? rawStatus : 'active'
          const normalizedIsActive = normalizedStatus === 'active' ? user?.isActive !== false : false
          return {
            ...user,
            id: typeof user?.id === 'number' ? user.id : Number(user?.id) || Date.now(),
            email: user?.email ?? '',
            department: user?.department ?? '',
            managerId: user?.managerId ?? '',
            temporaryPassword: user?.temporaryPassword ?? '',
            mustChangePassword: user?.mustChangePassword ?? false,
            status: normalizedStatus,
            isActive: normalizedIsActive,
            role: normalizeRole(user?.role),
            archivedAt: user?.archivedAt ?? null,
            createdAt: user?.createdAt ?? new Date().toISOString(),
            updatedAt: user?.updatedAt ?? new Date().toISOString(),
          }
        })

        setSiteUsers(normalizedUsers)
      } catch {
        if (isMounted) {
          setSiteUsersError('Unable to load Site Administrator users JSON. Verify /mock/site-admin/users.json')
        }
      } finally {
        if (isMounted) {
          setIsSiteUsersLoading(false)
        }
      }
    }

    loadSiteUsers()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    setUserFormValues((currentValues) => {
      if (currentValues.role === 'employee' || !currentValues.managerId) {
        return currentValues
      }

      return {
        ...currentValues,
        managerId: '',
      }
    })
  }, [userFormValues.role])

  useEffect(() => {
    if (!rotatingAlerts.length) {
      return undefined
    }

    const alertTimer = setInterval(() => {
      const randomAlert = rotatingAlerts[Math.floor(Math.random() * rotatingAlerts.length)]
      setLiveAlerts((currentAlerts) => [
        {
          id: Date.now(),
          level: randomAlert.level,
          message: randomAlert.message,
          time: new Date().toLocaleTimeString(),
        },
        ...currentAlerts,
      ].slice(0, 5))
    }, 9000)

    return () => clearInterval(alertTimer)
  }, [rotatingAlerts])

  const filteredAnnouncements = useMemo(() => {
    const normalizedQuery = announcementQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return announcementRecords
    }

    return announcementRecords.filter((announcement) =>
      announcement.title.toLowerCase().includes(normalizedQuery),
    )
  }, [announcementQuery, announcementRecords])

  const calendarDays = useMemo(() => buildCalendarDays(activeMonth), [activeMonth])

  const selectedDateEvents = useMemo(() => {
    return eventRecords[dateKey(selectedDate)] ?? []
  }, [selectedDate, eventRecords])

  const criticalIncidents = useMemo(() => {
    return incidentRecords.filter(
      (incidentRecord) =>
        (incidentRecord.severity === 'Critical' || incidentRecord.severity === 'High') &&
        incidentRecord.status !== 'Mitigated',
    )
  }, [incidentRecords])

  const allCalendarEvents = useMemo(() => {
    return Object.entries(eventRecords)
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .flatMap(([eventDate, eventValues]) =>
        (eventValues ?? []).map((eventValue, eventIndex) => ({
          date: eventDate,
          index: eventIndex,
          value: eventValue,
        })),
      )
  }, [eventRecords])

  const selectedDayCalendarEvents = useMemo(() => {
    return selectedDateEvents.map((eventValue, eventIndex) => ({
      date: dateKey(selectedDate),
      index: eventIndex,
      value: eventValue,
    }))
  }, [selectedDateEvents, selectedDate])

  const upcomingCalendarEvents = useMemo(() => {
    const todayKey = dateKey(now)
    return allCalendarEvents
      .filter((calendarEvent) => calendarEvent.date >= todayKey)
      .sort((leftEvent, rightEvent) => {
        const dateComparison = leftEvent.date.localeCompare(rightEvent.date)
        if (dateComparison !== 0) {
          return dateComparison
        }

        const textComparison = leftEvent.value.localeCompare(rightEvent.value, undefined, {
          sensitivity: 'base',
        })
        if (textComparison !== 0) {
          return textComparison
        }

        return leftEvent.index - rightEvent.index
      })
  }, [allCalendarEvents, now])

  const contextualHomePages = useMemo(() => {
    if (selectedQuickStartLabel === 'Home') {
      return ['Announcements']
    }

    if (selectedQuickStartLabel === 'Managers') {
      return ['Calendar']
    }

    if (selectedQuickStartLabel === 'Site Administrator') {
      return SITE_ADMINISTRATOR_PAGES
    }

    if (selectedQuickStartLabel === 'Programs') {
      return ['Add a program', 'Edit a program']
    }

    if (selectedQuickStartLabel === 'Community Housing') {
      return ['Add a residential', 'Edit a residential']
    }

    return []
  }, [selectedQuickStartLabel])
  const isHomeActionMenu =
    selectedQuickStartLabel === 'Home' ||
    selectedQuickStartLabel === 'Managers' ||
    selectedQuickStartLabel === 'Site Administrator'
  const isSelectedDayActive = isCalendarDayFocused
  const visibleCalendarEvents = isSelectedDayActive
    ? selectedDayCalendarEvents
    : upcomingCalendarEvents
  const calendarCardTitle = isSelectedDayActive ? 'Selected Day Calendar' : 'All Events Calendar'
  const calendarCardSubtitle = isSelectedDayActive
    ? selectedDate.toDateString()
    : 'Upcoming events from today forward (A-Z).'
  const emptyCalendarMessage = isSelectedDayActive
    ? 'No scheduled events for this day.'
    : 'No upcoming calendar events found.'
  const sortedSiteUsers = useMemo(() => {
    return [...siteUsers].sort((leftUser, rightUser) => {
      const leftStatus = isArchivedUser(leftUser) ? 'archived' : 'active'
      const rightStatus = isArchivedUser(rightUser) ? 'archived' : 'active'

      if (leftStatus !== rightStatus) {
        return leftStatus === 'archived' ? 1 : -1
      }

      const leftName = `${leftUser.lastName ?? ''} ${leftUser.firstName ?? ''}`.trim()
      const rightName = `${rightUser.lastName ?? ''} ${rightUser.firstName ?? ''}`.trim()
      return leftName.localeCompare(rightName)
    })
  }, [siteUsers])

  const filteredSiteUsers = useMemo(() => {
    if (userStatusFilter === 'all') {
      return sortedSiteUsers
    }

    const isActiveFilter = userStatusFilter === 'active'
    return sortedSiteUsers.filter((user) => (isActiveFilter ? !isArchivedUser(user) : isArchivedUser(user)))
  }, [sortedSiteUsers, userStatusFilter])

  const archivedUsersCount = useMemo(() => {
    return siteUsers.filter((user) => isArchivedUser(user)).length
  }, [siteUsers])

  const editingUser = useMemo(() => {
    return siteUsers.find((user) => user.id === editingUserId) ?? null
  }, [siteUsers, editingUserId])

  const managerOptions = useMemo(() => {
    return sortedSiteUsers
      .filter((user) => {
        if (isArchivedUser(user)) {
          return false
        }

        const normalizedRole = normalizeRole(user.role)
        return normalizedRole === 'manager' || normalizedRole === 'admin' || normalizedRole === 'super_admin'
      })
      .map((user) => ({
        value: user.id,
        label: `${[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed'} (${formatRoleLabel(user.role)})`,
      }))
      .sort((leftOption, rightOption) => leftOption.label.localeCompare(rightOption.label))
  }, [sortedSiteUsers])

  const activeGroupUserOptions = useMemo(() => {
    return sortedSiteUsers
      .filter((user) => !isArchivedUser(user))
      .map((user) => ({
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed user',
        roleLabel: formatRoleLabel(user.role),
      }))
  }, [sortedSiteUsers])

  const usersById = useMemo(() => {
    return new Map(siteUsers.map((user) => [user.id, user]))
  }, [siteUsers])

  const activeGroupMembers = useMemo(() => {
    if (!activeGroupMembersGroupId) {
      return []
    }

    const targetGroup = groups.find((group) => group.id === activeGroupMembersGroupId)
    const normalizedUserIds = (targetGroup?.userIds ?? [])
      .map((userId) => normalizeNumericId(userId))
      .filter((userId) => userId !== null)

    return normalizedUserIds
      .map((userId) => usersById.get(userId))
      .filter((member) => member && !isArchivedUser(member))
  }, [groups, activeGroupMembersGroupId, usersById])

  const isEmployeeRole = userFormValues.role === 'employee'

  function changeMonth(offset) {
    setActiveMonth(
      (currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1),
    )
  }

  async function persistDashboardSnapshot(overrides = {}) {
    if (!dashboardData) {
      return
    }

    const nextSnapshot = {
      ...dashboardData,
      announcements: announcementRecords,
      eventsByDate: eventRecords,
      incidents: incidentRecords,
      ...overrides,
    }

    setDashboardData(nextSnapshot)

    try {
      await saveHomeDashboardData(nextSnapshot)
      setDataError('')
    } catch {
      setDataError('Unable to save JSON data right now. Verify local file permissions.')
    }
  }

  function toggleIncidentStatus(incidentId) {
    const nextIncidents = incidentRecords.map((incidentRecord) => {
      if (incidentRecord.id !== incidentId) {
        return incidentRecord
      }

      return {
        ...incidentRecord,
        status: incidentRecord.status === 'Open' ? 'Investigating' : 'Mitigated',
      }
    })

    setIncidentRecords(nextIncidents)
    void persistDashboardSnapshot({ incidents: nextIncidents })
  }

  function openAnnouncementForm(announcementRecord = null) {
    const defaultTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    setActiveSectionLabel('Home')
    setActiveHomeExpandedView('announcements')
    setActiveHomeForm('announcement')

    if (announcementRecord) {
      setEditingAnnouncementId(announcementRecord.id)
      setAnnouncementForm({
        category: announcementRecord.category,
        title: announcementRecord.title,
        timestamp: announcementRecord.timestamp,
      })
      return
    }

    setEditingAnnouncementId(null)
    setAnnouncementForm({
      category: 'Agency',
      title: '',
      timestamp: defaultTimestamp,
    })
  }

  function openCalendarForm(calendarEvent = null, targetDate = selectedDate) {
    setSelectedQuickStartLabel('Managers')
    setActiveSectionLabel('Managers')
    setActiveHomeExpandedView(null)
    setActiveHomeForm('calendar')

    if (calendarEvent) {
      setEditingCalendarTarget(calendarEvent)
      setCalendarForm({
        date: calendarEvent.date,
        event: calendarEvent.value,
      })
      return
    }

    const nextDate = targetDate instanceof Date ? dateKey(targetDate) : targetDate

    setEditingCalendarTarget(null)
    setCalendarForm({
      date: nextDate || dateKey(selectedDate),
      event: '',
    })
  }

  function navigateToSiteAdministrator(panelLabel = 'Emplyees Management') {
    setSelectedQuickStartLabel('Site Administrator')
    setActiveSectionLabel('Site Administrator')
    setActiveSiteAdminPanel(panelLabel)
    setActiveHomeExpandedView(null)
    setActiveHomeForm(null)
    setEditingAnnouncementId(null)
    setEditingCalendarTarget(null)
    setIsCalendarDayFocused(false)
    setSiteUserMessage({ type: '', text: '' })
    setIsUserFormVisible(false)
    setGroupMessage({ type: '', text: '' })
    setIsGroupFormVisible(false)
    setActiveGroupMembersGroupId(null)
    setEditingGroupId(null)
    setEditGroupFormValues(buildEmptyGroupFormValues())
    setIsEditGroupModalOpen(false)
  }

  function handleSidebarAction(actionLabel) {
    if (actionLabel === 'Announcements') {
      setActiveSectionLabel('Home')
      setActiveHomeForm(null)
      setActiveHomeExpandedView('announcements')
      return
    }

    if (actionLabel === 'Calendar') {
      setSelectedQuickStartLabel('Managers')
      setActiveSectionLabel('Managers')
      setActiveHomeExpandedView(null)
      setActiveHomeForm(null)
      setEditingCalendarTarget(null)
      return
    }

    if (SITE_ADMINISTRATOR_PAGES.includes(actionLabel)) {
      navigateToSiteAdministrator(actionLabel)
      return
    }
  }

  function handleQuickStartSelection(itemLabel) {
    if (itemLabel === 'Site Administrator') {
      navigateToSiteAdministrator()
      return
    }

    setSelectedQuickStartLabel(itemLabel)
    setActiveSectionLabel(itemLabel)
    setActiveHomeExpandedView(null)
    setActiveHomeForm(null)
    setEditingAnnouncementId(null)
    setEditingCalendarTarget(null)
  }

  function returnToHomeDashboard() {
    setActiveHomeExpandedView(null)
    setActiveHomeForm(null)
    setEditingAnnouncementId(null)
    setEditingCalendarTarget(null)
  }

  function handleUserMenuSelect(menuItem) {
    if (menuItem === 'Site Administrator') {
      navigateToSiteAdministrator()
      setIsUserSettingsOpen(false)
      return
    }

    if (menuItem === 'Sign out') {
      setIsUserSettingsOpen(false)
      signOut()
      navigate('/login', { replace: true })
      return
    }

    setIsUserSettingsOpen(false)
  }

  function submitAnnouncementForm(event) {
    event.preventDefault()
    const trimmedTitle = announcementForm.title.trim()

    if (!trimmedTitle) {
      return
    }

    let nextAnnouncements = announcementRecords

    if (editingAnnouncementId) {
      nextAnnouncements = announcementRecords.map((announcementRecord) => {
        if (announcementRecord.id !== editingAnnouncementId) {
          return announcementRecord
        }

        return {
          ...announcementRecord,
          category: announcementForm.category.trim() || 'Agency',
          title: trimmedTitle,
          timestamp: announcementForm.timestamp.trim() || announcementRecord.timestamp,
        }
      })
    } else {
      nextAnnouncements = [
        {
          id: Date.now(),
          category: announcementForm.category.trim() || 'Agency',
          title: trimmedTitle,
          timestamp:
            announcementForm.timestamp.trim() ||
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...announcementRecords,
      ]
    }

    setAnnouncementRecords(nextAnnouncements)
    void persistDashboardSnapshot({ announcements: nextAnnouncements })

    setActiveHomeForm(null)
    setEditingAnnouncementId(null)
  }

  function deleteAnnouncement(announcementId) {
    const hasConfirmedDeletion = window.confirm('Are you sure you want to delete this announcement?')

    if (!hasConfirmedDeletion) {
      return
    }

    const nextAnnouncements = announcementRecords.filter(
      (announcementRecord) => announcementRecord.id !== announcementId,
    )

    setAnnouncementRecords(nextAnnouncements)
    void persistDashboardSnapshot({ announcements: nextAnnouncements })
  }

  function submitCalendarForm(event) {
    event.preventDefault()
    const trimmedEvent = calendarForm.event.trim()
    const targetDate = calendarForm.date

    if (!trimmedEvent || !targetDate) {
      return
    }

    const nextRecords = Object.fromEntries(
      Object.entries(eventRecords).map(([recordDate, values]) => [recordDate, [...values]]),
    )

    if (editingCalendarTarget) {
      const sourceDate = editingCalendarTarget.date
      const sourceIndex = editingCalendarTarget.index
      const sourceValues = nextRecords[sourceDate] ?? []

      if (sourceDate === targetDate) {
        if (sourceValues[sourceIndex] !== undefined) {
          sourceValues[sourceIndex] = trimmedEvent
        }
      } else {
        if (sourceValues[sourceIndex] !== undefined) {
          sourceValues.splice(sourceIndex, 1)
        }

        if (!sourceValues.length) {
          delete nextRecords[sourceDate]
        }

        const targetValues = nextRecords[targetDate] ?? []
        nextRecords[targetDate] = [...targetValues, trimmedEvent]
      }
    } else {
      const targetValues = nextRecords[targetDate] ?? []
      nextRecords[targetDate] = [...targetValues, trimmedEvent]
    }

    setEventRecords(nextRecords)
    void persistDashboardSnapshot({ eventsByDate: nextRecords })

    setActiveHomeForm(null)
    setEditingCalendarTarget(null)
  }

  function deleteCalendarEvent(eventDate, eventIndex) {
    const hasConfirmedDeletion = window.confirm('Are you sure you want to delete this calendar event?')

    if (!hasConfirmedDeletion) {
      return
    }

    const nextRecords = Object.fromEntries(
      Object.entries(eventRecords).map(([recordDate, values]) => [recordDate, [...values]]),
    )
    const dateEvents = nextRecords[eventDate] ?? []

    if (dateEvents[eventIndex] === undefined) {
      return
    }

    dateEvents.splice(eventIndex, 1)

    if (!dateEvents.length) {
      delete nextRecords[eventDate]
    }

    setEventRecords(nextRecords)
    void persistDashboardSnapshot({ eventsByDate: nextRecords })
  }

  function openNewUserForm() {
    setEditingUserId(null)
    setUserFormValues(buildEmptyUserFormValues())
    setSiteUserMessage({ type: '', text: '' })
    setIsUserFormVisible(true)
    setIsEditModalOpen(false)
    setLastGeneratedPassword('')
  }

  function toggleNewUserForm() {
    if (isUserFormVisible) {
      handleCancelUserForm()
      return
    }

    openNewUserForm()
  }

  function handleUserFieldChange(fieldName, value) {
    setUserFormValues((currentValues) => {
      let nextValue = value

      if (fieldName === 'managerId') {
        nextValue = value ? Number(value) : ''
      }

      if (fieldName === 'role') {
        nextValue = normalizeRole(value)
      }

      if (
        ['autoGeneratePassword', 'mustChangePassword', 'resetPassword', 'generateNewPassword', 'isActive'].includes(
          fieldName,
        )
      ) {
        nextValue = Boolean(value)
      }

      const nextState = {
        ...currentValues,
        [fieldName]: nextValue,
      }

      if (fieldName === 'autoGeneratePassword' && nextValue) {
        nextState.temporaryPassword = ''
      }

      if (fieldName === 'resetPassword' && !nextValue) {
        nextState.temporaryPassword = ''
      }

      return nextState
    })
  }

  async function persistSiteUsers(nextUsers, successMessage) {
    setSiteUsers(nextUsers)
    setSiteUserMessage({ type: '', text: '' })
    try {
      await saveSiteUsers(nextUsers)
      setSiteUsersError('')
      setSiteUserMessage({ type: 'success', text: successMessage })
      return true
    } catch {
      setSiteUserMessage({
        type: 'error',
        text: 'Unable to save Site Administrator users. Verify /api/site-admin/users.',
      })
      return false
    }
  }

  function handleEditUser(userId) {
    const targetUser = siteUsers.find((user) => user.id === userId)

    if (!targetUser) {
      return
    }

    setEditingUserId(userId)
    setUserFormValues(
      buildEmptyUserFormValues({
        firstName: targetUser.firstName ?? '',
        lastName: targetUser.lastName ?? '',
        email: getDisplayEmail(targetUser) ?? '',
        role: normalizeRole(targetUser.role),
        department: targetUser.department ?? '',
        managerId: targetUser.managerId ?? '',
        startDate: targetUser.startDate ?? '',
        notes: targetUser.notes ?? '',
        isActive: !isArchivedUser(targetUser),
        mustChangePassword: Boolean(targetUser.mustChangePassword),
        autoGeneratePassword: true,
        temporaryPassword: '',
        resetPassword: false,
        generateNewPassword: true,
      }),
    )
    setSiteUserMessage({ type: '', text: '' })
    setIsUserFormVisible(false)
    setIsEditModalOpen(true)
    setLastGeneratedPassword('')
  }

  async function submitUserForm(event) {
    event.preventDefault()
    const trimmedFirstName = userFormValues.firstName.trim()
    const trimmedLastName = userFormValues.lastName.trim()
    const trimmedEmail = userFormValues.email.trim()
    const trimmedRole = normalizeRole(userFormValues.role)
    const trimmedDepartment = userFormValues.department.trim()

    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail) {
      setSiteUserMessage({
        type: 'error',
        text: 'First name, last name, and email are required.',
      })
      return
    }

    const conflictingUser = siteUsers.find((user) => {
      if (editingUserId && user.id === editingUserId) {
        return false
      }

      if (isArchivedUser(user)) {
        return false
      }

      return (user.email ?? '').toLowerCase() === trimmedEmail.toLowerCase()
    })

    if (conflictingUser) {
      setSiteUserMessage({
        type: 'error',
        text: 'Another active user already uses that email.',
      })
      return
    }

    setIsSavingUser(true)

    const normalizedManagerId =
      trimmedRole === 'employee' && userFormValues.managerId ? Number(userFormValues.managerId) : ''
    const editingUserRecord = editingUserId ? siteUsers.find((user) => user.id === editingUserId) ?? null : null
    const desiredIsActive = editingUserId ? Boolean(userFormValues.isActive) : true
    const wasArchived = editingUserRecord ? isArchivedUser(editingUserRecord) : false
    const desiredStatus = (() => {
      if (!editingUserId) {
        return 'active'
      }

      if (desiredIsActive) {
        return 'active'
      }

      return wasArchived ? 'archived' : 'disabled'
    })()
    const previousBaseEmail = editingUserRecord ? extractOriginalEmail(editingUserRecord.email) : ''
    let emailToPersist = trimmedEmail

    if (editingUserId && desiredStatus === 'archived') {
      if (trimmedEmail === previousBaseEmail && editingUserRecord?.status === 'archived') {
        emailToPersist = editingUserRecord.email
      } else {
        emailToPersist = buildArchivedEmail(trimmedEmail, editingUserRecord?.id ?? Date.now())
      }
    }

    const needsNewPassword = !editingUserId || (editingUserId && userFormValues.resetPassword)
    let passwordToPersist = ''
    let passwordNotice = ''
    let mustChangePassword = Boolean(userFormValues.mustChangePassword)

    if (needsNewPassword) {
      const shouldAutoGenerate = !editingUserId
        ? userFormValues.autoGeneratePassword
        : userFormValues.generateNewPassword

      if (shouldAutoGenerate) {
        passwordToPersist = generateTemporaryPassword()
        mustChangePassword = true
        passwordNotice = ` Temporary password: ${passwordToPersist}`
      } else {
        const providedPassword = userFormValues.temporaryPassword.trim()
        if (providedPassword.length < 8) {
          setSiteUserMessage({
            type: 'error',
            text: 'Temporary passwords must be at least 8 characters.',
          })
          setIsSavingUser(false)
          return
        }
        passwordToPersist = providedPassword
      }
    }

    const normalizedValues = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: emailToPersist,
      role: trimmedRole,
      department: trimmedDepartment,
      managerId: normalizedManagerId || '',
      startDate: userFormValues.startDate,
      notes: userFormValues.notes,
      status: desiredStatus,
      isActive: desiredStatus === 'active',
    }

    let nextUsers = siteUsers
    let successMessage = 'User saved.'
    const timestamp = new Date().toISOString()

    if (editingUserId) {
      nextUsers = siteUsers.map((user) => {
        if (user.id !== editingUserId) {
          return user
        }

        const nextArchivedAt = normalizedValues.status === 'active' ? null : user.archivedAt ?? timestamp

        return {
          ...user,
          ...normalizedValues,
          temporaryPassword: passwordToPersist || user.temporaryPassword,
          mustChangePassword: needsNewPassword ? mustChangePassword : user.mustChangePassword,
          lastPasswordIssuedAt: needsNewPassword ? timestamp : user.lastPasswordIssuedAt,
          archivedAt: nextArchivedAt,
          updatedAt: timestamp,
        }
      })
      const statusChanged = editingUserRecord
        ? Boolean(desiredIsActive) !== (editingUserRecord.isActive !== false)
        : false
      const statusNotice = statusChanged ? (desiredIsActive ? ' User enabled.' : ' User disabled.') : ''
      successMessage = `User details updated.${passwordNotice}${statusNotice}`
    } else {
      if (!passwordToPersist) {
        setSiteUserMessage({
          type: 'error',
          text: 'A temporary password is required for new users.',
        })
        setIsSavingUser(false)
        return
      }

      const newUser = {
        id: Date.now(),
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...normalizedValues,
        temporaryPassword: passwordToPersist,
        mustChangePassword,
        lastPasswordIssuedAt: timestamp,
      }
      nextUsers = [newUser, ...siteUsers]
      successMessage = `New user added.${passwordNotice}`
    }

    const hasSaved = await persistSiteUsers(nextUsers, successMessage)
    if (hasSaved) {
      const wasEditing = Boolean(editingUserId)
      setEditingUserId(null)
      setUserFormValues(buildEmptyUserFormValues())
      setLastGeneratedPassword(passwordNotice ? passwordToPersist : '')
      if (wasEditing) {
        setIsEditModalOpen(false)
      } else {
        setIsUserFormVisible(true)
      }
    }

    setIsSavingUser(false)
  }

  function handleCancelUserForm() {
    setEditingUserId(null)
    setUserFormValues(buildEmptyUserFormValues())
    setIsUserFormVisible(false)
    setIsEditModalOpen(false)
    setSiteUserMessage({ type: '', text: '' })
    setIsSavingUser(false)
    setLastGeneratedPassword('')
  }

  function handleDeleteUser(userId) {
    const targetUser = siteUsers.find((user) => user.id === userId)

    if (!targetUser) {
      return
    }

    if (!isArchivedUser(targetUser)) {
      setSiteUserMessage({
        type: 'error',
        text: 'Archive the user before permanently deleting them.',
      })
      return
    }

    const hasConfirmedDeletion = window.confirm(
      `Permanently delete ${[targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ')} and all related data? This cannot be undone.`,
    )

    if (!hasConfirmedDeletion) {
      return
    }

    const nextUsers = siteUsers.filter((user) => user.id !== userId)
    void persistSiteUsers(nextUsers, 'User permanently deleted.')

    if (editingUserId === userId) {
      handleCancelUserForm()
    }
  }

  function handleArchiveUser(userId) {
    const targetUser = siteUsers.find((user) => user.id === userId)

    if (!targetUser || isArchivedUser(targetUser)) {
      return
    }

    const hasConfirmedArchive = window.confirm(
      `Archive ${[targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ')}? They will lose access but historical data stays intact.`,
    )

    if (!hasConfirmedArchive) {
      return
    }

    const archivedEmail = buildArchivedEmail(targetUser.email, userId)
    const nextUsers = siteUsers.map((user) => {
      if (user.id !== userId) {
        return user
      }

      return {
        ...user,
        email: archivedEmail,
        status: 'archived',
        isActive: false,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    void persistSiteUsers(nextUsers, 'User archived. Original email can now be reused.')

    if (editingUserId === userId) {
      handleCancelUserForm()
    }
  }

  function handleRestoreUser(userId) {
    const targetUser = siteUsers.find((user) => user.id === userId)

    if (!targetUser || !isArchivedUser(targetUser)) {
      return
    }

    const originalEmail = extractOriginalEmail(targetUser.email)
    const hasConflict = siteUsers.some(
      (user) => !isArchivedUser(user) && user.id !== userId && (user.email ?? '').toLowerCase() === originalEmail.toLowerCase(),
    )

    if (hasConflict) {
      setSiteUserMessage({
        type: 'error',
        text: 'Cannot rehire this user because the original email is already in use.',
      })
      return
    }

    const hasConfirmedRestore = window.confirm(
      `Rehire ${[targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ')} and restore their access?`,
    )

    if (!hasConfirmedRestore) {
      return
    }

    const nextUsers = siteUsers.map((user) => {
      if (user.id !== userId) {
        return user
      }

      return {
        ...user,
        email: originalEmail,
        status: 'active',
        isActive: true,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      }
    })

    void persistSiteUsers(nextUsers, 'User reactivated successfully.')
  }

  function openNewGroupForm() {
    setGroupFormValues(buildEmptyGroupFormValues())
    setGroupMessage({ type: '', text: '' })
    setIsGroupFormVisible(true)
  }

  function toggleNewGroupForm() {
    if (isGroupFormVisible) {
      handleCancelGroupForm()
      return
    }

    openNewGroupForm()
  }

  function handleGroupFieldChange(fieldName, value) {
    setGroupFormValues((currentValues) => ({
      ...currentValues,
      [fieldName]: value,
    }))
  }

  function handleGroupUserSelection(userId, checked) {
    const normalizedUserId = normalizeNumericId(userId)
    if (normalizedUserId === null) {
      return
    }

    setGroupFormValues((currentValues) => {
      const selectedIds = currentValues.userIds ?? []
      if (checked) {
        if (selectedIds.includes(normalizedUserId)) {
          return currentValues
        }

        return {
          ...currentValues,
          userIds: [...selectedIds, normalizedUserId],
        }
      }

      return {
        ...currentValues,
        userIds: selectedIds.filter((id) => id !== normalizedUserId),
      }
    })
  }

  function handleCancelGroupForm() {
    setGroupFormValues(buildEmptyGroupFormValues())
    setIsGroupFormVisible(false)
    setGroupMessage({ type: '', text: '' })
    setIsSavingGroup(false)
  }

  function handleEditGroup(groupId) {
    const targetGroup = groups.find((group) => group.id === groupId)

    if (!targetGroup) {
      return
    }

    const activeUserIds = new Set(activeGroupUserOptions.map((user) => user.id))
    const normalizedUserIds = (targetGroup.userIds ?? [])
      .map((userId) => normalizeNumericId(userId))
      .filter((userId) => userId !== null && activeUserIds.has(userId))
    const normalizedManagerId =
      targetGroup.managerId && activeUserIds.has(targetGroup.managerId) ? targetGroup.managerId : ''

    setEditingGroupId(groupId)
    setEditGroupFormValues(
      buildEmptyGroupFormValues({
        name: targetGroup.name ?? '',
        description: targetGroup.description ?? '',
        managerId: normalizedManagerId,
        userIds: normalizedUserIds,
      }),
    )
    setGroupMessage({ type: '', text: '' })
    setIsEditGroupModalOpen(true)
  }

  function handleEditGroupFieldChange(fieldName, value) {
    setEditGroupFormValues((currentValues) => ({
      ...currentValues,
      [fieldName]: value,
    }))
  }

  function handleEditGroupUserSelection(userId, checked) {
    const normalizedUserId = normalizeNumericId(userId)
    if (normalizedUserId === null) {
      return
    }

    setEditGroupFormValues((currentValues) => {
      const selectedIds = currentValues.userIds ?? []
      if (checked) {
        if (selectedIds.includes(normalizedUserId)) {
          return currentValues
        }

        return {
          ...currentValues,
          userIds: [...selectedIds, normalizedUserId],
        }
      }

      return {
        ...currentValues,
        userIds: selectedIds.filter((id) => id !== normalizedUserId),
      }
    })
  }

  function handleCancelEditGroupForm() {
    setEditingGroupId(null)
    setEditGroupFormValues(buildEmptyGroupFormValues())
    setIsEditGroupModalOpen(false)
    setGroupMessage({ type: '', text: '' })
    setIsSavingGroup(false)
  }

  function submitEditGroupForm(event) {
    event.preventDefault()

    if (!editingGroupId) {
      return
    }

    const trimmedName = editGroupFormValues.name.trim()
    const trimmedDescription = editGroupFormValues.description.trim()
    const selectedManagerId = editGroupFormValues.managerId ? Number(editGroupFormValues.managerId) : null

    if (!trimmedName) {
      setGroupMessage({ type: 'error', text: 'Group name is required.' })
      return
    }

    if (!selectedManagerId) {
      setGroupMessage({ type: 'error', text: 'Group manager is required.' })
      return
    }

    const activeUserIds = new Set(activeGroupUserOptions.map((user) => user.id))
    const selectedUserIds = Array.from(
      new Set(
        (editGroupFormValues.userIds ?? [])
          .map((userId) => normalizeNumericId(userId))
          .filter((userId) => userId !== null && activeUserIds.has(userId)),
      ),
    )

    if (!activeUserIds.has(selectedManagerId)) {
      setGroupMessage({ type: 'error', text: 'Group manager must be an active user.' })
      return
    }

    if (!selectedUserIds.includes(selectedManagerId)) {
      selectedUserIds.push(selectedManagerId)
    }

    if (!selectedUserIds.length) {
      setGroupMessage({ type: 'error', text: 'Select at least one active user.' })
      return
    }

    const normalizedName = trimmedName.toLowerCase()
    const hasDuplicateGroup = groups.some(
      (group) => group.id !== editingGroupId && group.name.trim().toLowerCase() === normalizedName,
    )

    if (hasDuplicateGroup) {
      setGroupMessage({ type: 'error', text: 'A group with this name already exists.' })
      return
    }

    setIsSavingGroup(true)

    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id !== editingGroupId) {
          return group
        }

        return {
          ...group,
          name: trimmedName,
          description: trimmedDescription,
          managerId: selectedManagerId,
          userIds: selectedUserIds,
          updatedAt: new Date().toISOString(),
        }
      }),
    )

    setEditingGroupId(null)
    setEditGroupFormValues(buildEmptyGroupFormValues())
    setIsEditGroupModalOpen(false)
    setIsSavingGroup(false)
    setGroupMessage({ type: 'success', text: 'Group updated successfully.' })
  }

  function handleDeleteGroup(groupId) {
    const targetGroup = groups.find((group) => group.id === groupId)

    if (!targetGroup) {
      return
    }

    const hasConfirmedDelete = window.confirm(
      `Delete group \"${targetGroup.name}\"? This action cannot be undone.`,
    )

    if (!hasConfirmedDelete) {
      return
    }

    setGroups((currentGroups) => currentGroups.filter((group) => group.id !== groupId))
    if (activeGroupMembersGroupId === groupId) {
      setActiveGroupMembersGroupId(null)
    }
    if (editingGroupId === groupId) {
      handleCancelEditGroupForm()
    }
    setGroupMessage({ type: 'success', text: 'Group deleted successfully.' })
  }

  function submitGroupForm(event) {
    event.preventDefault()
    const trimmedName = groupFormValues.name.trim()
    const trimmedDescription = groupFormValues.description.trim()
    const selectedManagerId = groupFormValues.managerId ? Number(groupFormValues.managerId) : null

    if (!trimmedName) {
      setGroupMessage({ type: 'error', text: 'Group name is required.' })
      return
    }

    if (!selectedManagerId) {
      setGroupMessage({ type: 'error', text: 'Group manager is required.' })
      return
    }

    const activeUserIds = new Set(activeGroupUserOptions.map((user) => user.id))
    const selectedUserIds = Array.from(
      new Set(
        (groupFormValues.userIds ?? [])
          .map((userId) => normalizeNumericId(userId))
          .filter((userId) => userId !== null && activeUserIds.has(userId)),
      ),
    )

    if (!activeUserIds.has(selectedManagerId)) {
      setGroupMessage({ type: 'error', text: 'Group manager must be an active user.' })
      return
    }

    if (!selectedUserIds.includes(selectedManagerId)) {
      selectedUserIds.push(selectedManagerId)
    }

    if (!selectedUserIds.length) {
      setGroupMessage({ type: 'error', text: 'Select at least one active user.' })
      return
    }

    const normalizedName = trimmedName.toLowerCase()
    const hasDuplicateGroup = groups.some((group) => group.name.trim().toLowerCase() === normalizedName)

    if (hasDuplicateGroup) {
      setGroupMessage({ type: 'error', text: 'A group with this name already exists.' })
      return
    }

    setIsSavingGroup(true)

    const newGroup = {
      id: Date.now(),
      name: trimmedName,
      description: trimmedDescription,
      managerId: selectedManagerId,
      userIds: selectedUserIds,
      createdAt: new Date().toISOString(),
    }

    setGroups((currentGroups) => [newGroup, ...currentGroups])
    setGroupFormValues(buildEmptyGroupFormValues())
    setGroupMessage({ type: 'success', text: 'Group created successfully.' })
    setIsSavingGroup(false)
  }

  return (
    <div className="sv-layout">
      <header className="sv-topbar">
        <div className="sv-topbar__brand">
          <span className="sv-logo">Managers</span>
          <div>
            <p className="sv-topbar__system">{systemLabel}</p>
            <h1 className="sv-topbar__organization">{organizationName}</h1>
          </div>
        </div>

        <div className="sv-topbar__meta">
          <span className="sv-live-dot" />
          <span>Live {now.toLocaleTimeString()}</span>
          <button
            type="button"
            className="sv-theme-toggle"
            onClick={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {themeMode === 'dark' ? '☀ Light' : '🌙 Dark'}
          </button>
          <div className="sv-user-menu">
            <span className="sv-user-pill">{displayUserName}</span>
            <button
              type="button"
              className="sv-theme-toggle sv-settings-toggle"
              onClick={() => setIsUserSettingsOpen((isOpen) => !isOpen)}
              aria-label="Open settings menu"
              aria-expanded={isUserSettingsOpen}
              aria-haspopup="menu"
              title="Settings"
            >
              ⚙
            </button>

            {isUserSettingsOpen && (
              <ul className="sv-settings-menu" role="menu" aria-label="User settings menu">
                {['Manager my Account', 'Site Administrator', 'Sign out'].map((menuItem) => (
                  <li key={menuItem} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleUserMenuSelect(menuItem)}
                    >
                      {menuItem}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>

      <div className="sv-content">
        <aside className={`sv-sidebar ${isQuickStartCollapsed ? 'is-collapsed' : ''}`}>
          <div className="sv-sidebar__section">
            <div
              className="sv-section-header sv-section-header--toggle"
              role="button"
              tabIndex={0}
              aria-expanded={!isQuickStartCollapsed}
              aria-label="Toggle Quick Start"
              onClick={() => setIsQuickStartCollapsed((collapsed) => !collapsed)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setIsQuickStartCollapsed((collapsed) => !collapsed)
                }
              }}
            >
              <h2>Quick Start</h2>
            </div>

            {!isQuickStartCollapsed && (
              <div className="sv-quick-grid">
                {quickStartItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="sv-quick-tile"
                    onClick={() => handleQuickStartSelection(item.label)}
                  >
                    <span className="sv-quick-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sv-sidebar__section">
            <div className="sv-section-header">
              <h2>{selectedQuickStartLabel}</h2>
            </div>
            <ul className="sv-home-pages">
              {contextualHomePages.map((homePage) => (
                <li key={homePage}>
                  {isHomeActionMenu ? (
                    <button
                      type="button"
                      className="sv-home-page-action"
                      onClick={() => handleSidebarAction(homePage)}
                    >
                      {homePage}
                    </button>
                  ) : (
                    <span className="sv-home-page-action">{homePage}</span>
                  )}
                </li>
              ))}
              {!contextualHomePages.length && <li className="sv-empty">No pages configured.</li>}
            </ul>
          </div>
        </aside>

        <main className={`sv-main ${activeSectionLabel === 'Home' ? '' : 'is-page-black'}`}>
          {activeSectionLabel === 'Home' ? (
            <>
              {isLoadingData && <div className="sv-status">Loading dashboard JSON data...</div>}
              {dataError && <div className="sv-status is-error">{dataError}</div>}

              <div className="sv-main__headline">
                <h2>Home</h2>
                <p>Operational home screen with live updates and actionable components.</p>
              </div>

              {activeHomeExpandedView === 'announcements' && (
                <section className="sv-card sv-home-expanded">
                  <div className="sv-card__header">
                    <h3>All Announcements</h3>
                    <div className="sv-row-actions">
                      <button type="button" className="sv-mini-btn" onClick={returnToHomeDashboard}>
                        ← Back to Dashboard
                      </button>
                      <input
                        value={announcementQuery}
                        onChange={(event) => setAnnouncementQuery(event.target.value)}
                        placeholder="Search announcements"
                      />
                      <button type="button" className="sv-mini-btn" onClick={() => openAnnouncementForm()}>
                        Add Announcement
                      </button>
                    </div>
                  </div>

                  {activeHomeForm === 'announcement' && (
                    <section className="sv-card sv-card--editor">
                      <div className="sv-card__header">
                        <h3>{editingAnnouncementId ? 'Edit Announcement' : 'Add Announcement'}</h3>
                      </div>
                      <form className="sv-form-grid" onSubmit={submitAnnouncementForm}>
                        <label className="sv-field">
                          <span>Category</span>
                          <input
                            value={announcementForm.category}
                            onChange={(event) =>
                              setAnnouncementForm((currentForm) => ({
                                ...currentForm,
                                category: event.target.value,
                              }))
                            }
                            placeholder="Agency"
                          />
                        </label>
                        <label className="sv-field">
                          <span>Time</span>
                          <input
                            value={announcementForm.timestamp}
                            onChange={(event) =>
                              setAnnouncementForm((currentForm) => ({
                                ...currentForm,
                                timestamp: event.target.value,
                              }))
                            }
                            placeholder="11:15"
                          />
                        </label>
                        <label className="sv-field sv-field--full">
                          <span>Announcement</span>
                          <textarea
                            value={announcementForm.title}
                            onChange={(event) =>
                              setAnnouncementForm((currentForm) => ({
                                ...currentForm,
                                title: event.target.value,
                              }))
                            }
                            placeholder="Write announcement details"
                          />
                        </label>
                        <div className="sv-form-actions">
                          <button type="submit">{editingAnnouncementId ? 'Update' : 'Add'}</button>
                          <button type="button" onClick={() => setActiveHomeForm(null)}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    </section>
                  )}

                  <ul className="sv-list">
                    {filteredAnnouncements.map((announcement) => (
                      <li key={announcement.id}>
                        <div>
                          <span className="sv-chip">{announcement.category}</span>
                          <p>{announcement.title}</p>
                        </div>
                        <div className="sv-row-actions">
                          <small>{announcement.timestamp}</small>
                          <button
                            type="button"
                            className="sv-mini-btn"
                            onClick={() => openAnnouncementForm(announcement)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="sv-mini-btn is-danger"
                            onClick={() => deleteAnnouncement(announcement.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                    {!filteredAnnouncements.length && (
                      <li className="sv-empty">No announcements found.</li>
                    )}
                  </ul>
                </section>
              )}

              {!activeHomeExpandedView && <div className="sv-grid">
                <section className="sv-card sv-card--announcements">
                  <div className="sv-card__header">
                    <h3>Agency Announcements</h3>
                    <input
                      value={announcementQuery}
                      onChange={(event) => setAnnouncementQuery(event.target.value)}
                      placeholder="Search announcements"
                    />
                  </div>

                  <ul className="sv-list">
                    {filteredAnnouncements.map((announcement) => (
                      <li key={announcement.id}>
                        <div>
                          <span className="sv-chip">{announcement.category}</span>
                          <p>{announcement.title}</p>
                        </div>
                        <div className="sv-row-actions">
                          <small>{announcement.timestamp}</small>
                          <button
                            type="button"
                            className="sv-mini-btn"
                            onClick={() => openAnnouncementForm(announcement)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="sv-mini-btn is-danger"
                            onClick={() => deleteAnnouncement(announcement.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                    {!filteredAnnouncements.length && (
                      <li className="sv-empty">No announcements found.</li>
                    )}
                  </ul>
                </section>

                <section className="sv-card">
                  <div className="sv-card__header">
                    <h3>Live Alerts</h3>
                  </div>

                  <ul className="sv-live-alerts">
                    {liveAlerts.map((alertRecord) => (
                      <li key={alertRecord.id} className={`is-${alertRecord.level}`}>
                        <p>{alertRecord.message}</p>
                        <small>{alertRecord.time}</small>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="sv-card sv-card--spotlight">
                  <div className="sv-spotlight">
                    <div className="sv-spotlight__image" aria-hidden="true">
                      <span>SV</span>
                    </div>
                    <div>
                      <h3>{spotlight.title}</h3>
                      <p>{spotlight.description}</p>
                    </div>
                  </div>
                </section>

                <section className="sv-card sv-card--incidents">
                  <div className="sv-card__header">
                    <h3>Current Critical Incidents</h3>
                    <span className="sv-count-pill">{criticalIncidents.length}</span>
                  </div>

                  <ul className="sv-incident-list">
                    {criticalIncidents.map((incidentRecord) => (
                      <li key={incidentRecord.id}>
                        <div>
                          <p>{incidentRecord.title}</p>
                          <small>
                            {incidentRecord.owner} · {incidentRecord.severity}
                          </small>
                        </div>
                        <button type="button" onClick={() => toggleIncidentStatus(incidentRecord.id)}>
                          {incidentRecord.status}
                        </button>
                      </li>
                    ))}
                    {!criticalIncidents.length && (
                      <li className="sv-empty">No active critical/high incidents right now.</li>
                    )}
                  </ul>
                </section>

              </div>}
            </>
          ) : activeSectionLabel === 'Managers' ? (
            <>
              {isLoadingData && <div className="sv-status">Loading dashboard JSON data...</div>}
              {dataError && <div className="sv-status is-error">{dataError}</div>}

              <div className="sv-main__headline">
                <div>
                  <h2>Managers</h2>
                  <p>Calendar and coordination workflows for the care team.</p>
                </div>
                <button type="button" className="sv-mini-btn" onClick={() => openCalendarForm()}>
                  Add Calendar Event
                </button>
              </div>

              {activeHomeForm === 'calendar' && (
                <section className="sv-card sv-card--editor">
                  <div className="sv-card__header">
                    <h3>{editingCalendarTarget ? 'Edit Calendar' : 'Add Calendar'}</h3>
                  </div>
                  <form className="sv-form-grid" onSubmit={submitCalendarForm}>
                    <label className="sv-field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={calendarForm.date}
                        onChange={(event) =>
                          setCalendarForm((currentForm) => ({
                            ...currentForm,
                            date: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="sv-field sv-field--full">
                      <span>Event</span>
                      <textarea
                        value={calendarForm.event}
                        onChange={(event) =>
                          setCalendarForm((currentForm) => ({
                            ...currentForm,
                            event: event.target.value,
                          }))
                        }
                        placeholder="Write calendar event details"
                      />
                    </label>
                    <div className="sv-form-actions">
                      <button type="submit">{editingCalendarTarget ? 'Update' : 'Add'}</button>
                      <button type="button" onClick={() => setActiveHomeForm(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </section>
              )}

              <div className="sv-grid">
                <section className="sv-card sv-card--calendar">
                  <div className="sv-card__header">
                    <h3>Association Calendar</h3>
                    <div className="sv-row-actions">
                      <div className="sv-calendar-controls">
                        <button type="button" onClick={() => changeMonth(-1)}>
                          ←
                        </button>
                        <strong>
                          {activeMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                        </strong>
                        <button type="button" onClick={() => changeMonth(1)}>
                          →
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="sv-calendar-grid">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel) => (
                      <strong key={dayLabel}>{dayLabel}</strong>
                    ))}

                    {calendarDays.map((dayValue, index) => {
                      if (!dayValue) {
                        return <span className="sv-calendar-empty" key={`empty-${index}`} />
                      }

                      const dayValueKey = dateKey(dayValue)
                      const isSelected = dayValueKey === dateKey(selectedDate)
                      const dayEvents = eventRecords[dayValueKey] ?? []

                      return (
                        <button
                          key={dayValueKey}
                          type="button"
                          className={`sv-calendar-day ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => {
                            setSelectedDate(dayValue)
                            setIsCalendarDayFocused(true)
                          }}
                          onDoubleClick={() => {
                            setSelectedDate(dayValue)
                            setIsCalendarDayFocused(true)
                            openCalendarForm(null, dayValue)
                          }}
                        >
                          <span className="sv-calendar-day-number">{dayValue.getDate()}</span>
                          {dayEvents.slice(0, 2).map((eventRecord, eventIndex) => (
                            <span className="sv-calendar-event-pill" key={`${dayValueKey}-${eventIndex}`}>
                              {eventRecord}
                            </span>
                          ))}
                          {dayEvents.length > 2 && (
                            <span className="sv-calendar-event-more">+{dayEvents.length - 2} more</span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                </section>

                <section className="sv-card">
                  <div className="sv-card__header">
                    <div>
                      <h3>{calendarCardTitle}</h3>
                      <small>{calendarCardSubtitle}</small>
                    </div>
                  </div>
                  <ul className="sv-expanded-list sv-expanded-list--scroll">
                    {visibleCalendarEvents.map((calendarEvent) => (
                      <li key={`${calendarEvent.date}-${calendarEvent.index}`}>
                        <div>
                          <span className="sv-chip">{calendarEvent.date}</span>
                          <p>{calendarEvent.value}</p>
                        </div>
                        <div className="sv-row-actions">
                          <button
                            type="button"
                            className="sv-mini-btn"
                            onClick={() => openCalendarForm(calendarEvent)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="sv-mini-btn is-danger"
                            onClick={() => deleteCalendarEvent(calendarEvent.date, calendarEvent.index)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                    {!visibleCalendarEvents.length && <li className="sv-empty">{emptyCalendarMessage}</li>}
                  </ul>
                </section>
              </div>
            </>
          ) : activeSectionLabel === 'Site Administrator' ? (
            <>
              {isLoadingData && <div className="sv-status">Loading dashboard JSON data...</div>}
              {dataError && <div className="sv-status is-error">{dataError}</div>}
              {isSiteUsersLoading && <div className="sv-status">Loading Site Administrator users...</div>}
              {siteUsersError && <div className="sv-status is-error">{siteUsersError}</div>}

              <div className="sv-main__headline">
                <div>
                  <h2>Site Administrator</h2>
                  <p>
                    {SITE_ADMIN_PANEL_DESCRIPTIONS[activeSiteAdminPanel] ??
                      SITE_ADMIN_PANEL_DESCRIPTIONS['Emplyees Management']}
                  </p>
                </div>
                <span className="sv-chip">{displayUserName}</span>
              </div>

              {activeSiteAdminPanel === 'Emplyees Management' ? (
                <section className="sv-card sv-card--full sv-admin-card sv-users-board">
                  <div className="sv-users-board__header">
                    <div>
                      <p className="sv-eyebrow">Super Admin</p>
                      <h3>Users Management</h3>
                      <small>Manage users, access, and system roles across the organization.</small>
                    </div>
                    <button
                      type="button"
                      className={`sv-users-primary-btn ${isUserFormVisible ? 'is-cancel' : ''}`}
                      onClick={toggleNewUserForm}
                      disabled={isSavingUser}
                    >
                      {isUserFormVisible ? 'Cancel' : '+ Add New User'}
                    </button>
                  </div>

                  {siteUserMessage.text && (
                    <div className={`sv-status ${siteUserMessage.type === 'error' ? 'is-error' : ''}`}>
                      {siteUserMessage.text}
                    </div>
                  )}
                  {lastGeneratedPassword && (
                    <div className="sv-password-hint">
                      Temporary password:
                      <strong> {lastGeneratedPassword}</strong>
                    </div>
                  )}

                  {isUserFormVisible && (
                    <section className="sv-users-create-card">
                      <div className="sv-users-form__header">
                        <h4>Create New User</h4>
                      </div>
                      <form className="sv-form-grid" onSubmit={submitUserForm}>
                        <label className="sv-field">
                          <span>First Name</span>
                          <input
                            value={userFormValues.firstName}
                            onChange={(event) => handleUserFieldChange('firstName', event.target.value)}
                            required
                          />
                        </label>
                        <label className="sv-field">
                          <span>Last Name</span>
                          <input
                            value={userFormValues.lastName}
                            onChange={(event) => handleUserFieldChange('lastName', event.target.value)}
                            required
                          />
                        </label>
                        <label className="sv-field">
                          <span>Email</span>
                          <input
                            type="email"
                            value={userFormValues.email}
                            onChange={(event) => handleUserFieldChange('email', event.target.value)}
                            required
                          />
                        </label>
                        <label className="sv-field">
                          <span>Temporary Password</span>
                          <input
                            type="text"
                            value={userFormValues.temporaryPassword}
                            onChange={(event) => handleUserFieldChange('temporaryPassword', event.target.value)}
                            placeholder="Auto-generated unless provided"
                            disabled={userFormValues.autoGeneratePassword}
                          />
                        </label>
                        <div className="sv-field sv-field--full">
                          <label className="sv-checkbox-row">
                            <input
                              type="checkbox"
                              checked={userFormValues.autoGeneratePassword}
                              onChange={(event) => handleUserFieldChange('autoGeneratePassword', event.target.checked)}
                            />
                            <span>Auto-generate a temporary password</span>
                          </label>
                          <small>Passwords must be at least 8 characters.</small>
                        </div>
                        <label className="sv-field">
                          <span>Role</span>
                          <select
                            value={userFormValues.role}
                            onChange={(event) => handleUserFieldChange('role', event.target.value)}
                          >
                            {ROLE_OPTIONS.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {formatRoleLabel(roleOption)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {isEmployeeRole && (
                          <label className="sv-field">
                            <span>Manager / Admin</span>
                            <select
                              value={userFormValues.managerId === '' ? '' : String(userFormValues.managerId)}
                              onChange={(event) => handleUserFieldChange('managerId', event.target.value)}
                            >
                              <option value="">No manager</option>
                              {managerOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="sv-field">
                          <span>Department</span>
                          <input
                            value={userFormValues.department}
                            onChange={(event) => handleUserFieldChange('department', event.target.value)}
                            placeholder="CenterPoint, Admin, etc."
                          />
                        </label>
                        <label className="sv-field">
                          <span>Start Date</span>
                          <input
                            type="date"
                            value={userFormValues.startDate}
                            onChange={(event) => handleUserFieldChange('startDate', event.target.value)}
                          />
                        </label>
                        <div className="sv-field sv-field--full">
                          <label className="sv-checkbox-row">
                            <input
                              type="checkbox"
                              checked={userFormValues.mustChangePassword}
                              onChange={(event) => handleUserFieldChange('mustChangePassword', event.target.checked)}
                            />
                            <span>Require password change on first sign-in</span>
                          </label>
                        </div>
                        <label className="sv-field sv-field--full">
                          <span>Notes</span>
                          <textarea
                            value={userFormValues.notes}
                            onChange={(event) => handleUserFieldChange('notes', event.target.value)}
                            placeholder="Optional context (assignments, onboarding notes, etc.)"
                          />
                        </label>

                        <div className="sv-form-actions">
                          <button type="submit" disabled={isSavingUser}>
                            {isSavingUser ? 'Saving…' : 'Create user'}
                          </button>
                          <button type="button" onClick={handleCancelUserForm} disabled={isSavingUser}>
                            Cancel
                          </button>
                        </div>
                      </form>
                      <p className="sv-users-create-card__note">
                        Note: Temporary passwords display here once generated. Share them securely with the employee – they will be
                        prompted to update it inside the app.
                      </p>
                    </section>
                  )}

                  <section className="sv-users-panel sv-users-panel--wide">
                    <div className="sv-users-panel__toolbar">
                      <div>
                        <h4>All Users</h4>
                        <small>
                          Showing {filteredSiteUsers.length} · {sortedSiteUsers.length} total ({archivedUsersCount} archived)
                        </small>
                      </div>
                      <div className="sv-users-filter" role="group" aria-label="Filter users by status">
                        <span>Showing</span>
                        {[
                          { key: 'active', label: 'Active' },
                          { key: 'all', label: 'All' },
                          { key: 'archived', label: 'Archived' },
                        ].map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            className={`sv-users-filter__option ${userStatusFilter === option.key ? 'is-selected' : ''}`}
                            onClick={() => setUserStatusFilter(option.key)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sv-users-table-wrapper">
                      <table className="sv-users-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Department</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSiteUsers.map((user) => {
                            const archived = isArchivedUser(user)
                            const normalizedStatus = (user.status ?? '').toString().toLowerCase()
                            const isDisabled = normalizedStatus === 'disabled'
                            const statusLabel = archived ? (isDisabled ? 'Disabled' : 'Archived') : 'Active'
                            return (
                              <tr key={user.id} className={archived ? 'is-archived' : ''}>
                                <td>
                                  <p className="sv-users-name">
                                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed user'}
                                  </p>
                                </td>
                                <td>
                                  <small title={user.email || undefined}>{getDisplayEmail(user) || 'No email provided'}</small>
                                </td>
                                <td>
                                  <span className={`sv-chip sv-chip--role sv-chip--role-${normalizeRole(user.role)}`}>
                                    {formatRoleLabel(user.role)}
                                  </span>
                                </td>
                                <td>{user.department || '—'}</td>
                                <td>
                                  <span
                                    className={`sv-status-pill ${archived ? (isDisabled ? 'is-disabled' : 'is-archived') : 'is-active'}`}
                                  >
                                    {statusLabel}
                                  </span>
                                </td>
                                <td>
                                  <div className="sv-row-actions">
                                    <button
                                      type="button"
                                      className="sv-mini-btn is-primary"
                                      onClick={() => handleEditUser(user.id)}
                                    >
                                      Edit
                                    </button>
                                    {!archived ? (
                                      <button
                                        type="button"
                                        className="sv-mini-btn is-warning"
                                        onClick={() => handleArchiveUser(user.id)}
                                      >
                                        Archive
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="sv-mini-btn is-success"
                                          onClick={() => handleRestoreUser(user.id)}
                                        >
                                          Rehire
                                        </button>
                                        <button
                                          type="button"
                                          className="sv-mini-btn is-danger"
                                          onClick={() => handleDeleteUser(user.id)}
                                        >
                                          Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {!filteredSiteUsers.length && (
                            <tr>
                              <td colSpan={6} className="sv-empty">
                                No users match this filter. Adjust the filter or add a new user.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {isEditModalOpen && (
                    <div className="sv-users-modal" role="dialog" aria-modal="true" aria-labelledby="svUserFormTitle">
                      <div className="sv-users-modal__backdrop" onClick={handleCancelUserForm} aria-hidden="true" />
                      <section className="sv-users-form sv-users-modal__panel">
                        <div className="sv-users-form__header">
                          <h4 id="svUserFormTitle">
                            {editingUser
                              ? `Edit ${[editingUser.firstName, editingUser.lastName].filter(Boolean).join(' ')}`
                              : 'Edit user'}
                          </h4>
                          <button
                            type="button"
                            className="sv-users-modal__close"
                            onClick={handleCancelUserForm}
                            disabled={isSavingUser}
                          >
                            Close
                          </button>
                        </div>

                        <form className="sv-form-grid" onSubmit={submitUserForm}>
                          <label className="sv-field">
                            <span>First Name</span>
                            <input
                              value={userFormValues.firstName}
                              onChange={(event) => handleUserFieldChange('firstName', event.target.value)}
                              required
                            />
                          </label>
                          <label className="sv-field">
                            <span>Last Name</span>
                            <input
                              value={userFormValues.lastName}
                              onChange={(event) => handleUserFieldChange('lastName', event.target.value)}
                              required
                            />
                          </label>
                          <label className="sv-field">
                            <span>Email</span>
                            <input
                              type="email"
                              value={userFormValues.email}
                              onChange={(event) => handleUserFieldChange('email', event.target.value)}
                              required
                            />
                          </label>
                          <label className="sv-field">
                            <span>Role</span>
                            <select
                              value={userFormValues.role}
                              onChange={(event) => handleUserFieldChange('role', event.target.value)}
                            >
                              {ROLE_OPTIONS.map((roleOption) => (
                                <option key={roleOption} value={roleOption}>
                                  {formatRoleLabel(roleOption)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {isEmployeeRole && (
                            <label className="sv-field">
                              <span>Manager / Admin</span>
                              <select
                                value={userFormValues.managerId === '' ? '' : String(userFormValues.managerId)}
                                onChange={(event) => handleUserFieldChange('managerId', event.target.value)}
                              >
                                <option value="">No manager</option>
                                {managerOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="sv-field">
                            <span>Department</span>
                            <input
                              value={userFormValues.department}
                              onChange={(event) => handleUserFieldChange('department', event.target.value)}
                            />
                          </label>
                          <label className="sv-field">
                            <span>Start Date</span>
                            <input
                              type="date"
                              value={userFormValues.startDate}
                              onChange={(event) => handleUserFieldChange('startDate', event.target.value)}
                            />
                          </label>
                          <label className="sv-field sv-field--full">
                            <span>Notes</span>
                            <textarea
                              value={userFormValues.notes}
                              onChange={(event) => handleUserFieldChange('notes', event.target.value)}
                              placeholder="Optional context (assignments, onboarding notes, etc.)"
                            />
                          </label>
                          {editingUserId && (
                            <div className="sv-field sv-field--full">
                              <span>Groups</span>
                              <div className="sv-toggle-row">
                                <label className="sv-switch">
                                  <input
                                    type="checkbox"
                                    checked={userFormValues.isActive}
                                    onChange={(event) => handleUserFieldChange('isActive', event.target.checked)}
                                  />
                                  <span className="sv-switch__track">
                                    <span className="sv-switch__thumb" />
                                  </span>
                                </label>
                                <div className="sv-toggle-row__copy">
                                  <p className="sv-toggle-row__status">
                                    {userFormValues.isActive ? 'Enabled' : 'Disabled'}
                                  </p>
                                  <small>
                                    {userFormValues.isActive
                                      ? 'The user can sign in immediately.'
                                      : 'The user loses access until you enable them again.'}
                                  </small>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="sv-field sv-field--full">
                            <label className="sv-checkbox-row">
                              <input
                                type="checkbox"
                                checked={userFormValues.resetPassword}
                                onChange={(event) => handleUserFieldChange('resetPassword', event.target.checked)}
                              />
                              <span>Reset password</span>
                            </label>
                          </div>
                          {userFormValues.resetPassword && (
                            <>
                              <label className="sv-field">
                                <span>New Temporary Password</span>
                                <input
                                  type="text"
                                  value={userFormValues.temporaryPassword}
                                  onChange={(event) => handleUserFieldChange('temporaryPassword', event.target.value)}
                                  placeholder="Auto-generated unless provided"
                                  disabled={userFormValues.generateNewPassword}
                                />
                              </label>
                              <div className="sv-field sv-field--full">
                                <label className="sv-checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={userFormValues.generateNewPassword}
                                    onChange={(event) => handleUserFieldChange('generateNewPassword', event.target.checked)}
                                  />
                                  <span>Generate a new temporary password</span>
                                </label>
                              </div>
                              <div className="sv-field sv-field--full">
                                <label className="sv-checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={userFormValues.mustChangePassword}
                                    onChange={(event) => handleUserFieldChange('mustChangePassword', event.target.checked)}
                                  />
                                  <span>Require password change on next sign-in</span>
                                </label>
                              </div>
                            </>
                          )}

                          <div className="sv-form-actions">
                            <button type="submit" disabled={isSavingUser}>
                              {isSavingUser ? 'Saving…' : 'Update user'}
                            </button>
                            <button type="button" onClick={handleCancelUserForm} disabled={isSavingUser}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      </section>
                    </div>
                  )}
                </section>
              ) : activeSiteAdminPanel === 'Groups' ? (
                <section className="sv-card sv-card--full sv-admin-card sv-users-board">
                  <div className="sv-users-board__header">
                    <div>
                      <p className="sv-eyebrow">Access Control</p>
                      <h3>Groups</h3>
                      <small>Create groups and assign active users from Emplyees Management.</small>
                    </div>
                    <button
                      type="button"
                      className={`sv-users-primary-btn ${isGroupFormVisible ? 'is-cancel' : ''}`}
                      onClick={toggleNewGroupForm}
                      disabled={isSavingGroup}
                    >
                      {isGroupFormVisible ? 'Cancel' : '+ Add Group'}
                    </button>
                  </div>

                  {groupMessage.text && (
                    <div className={`sv-status ${groupMessage.type === 'error' ? 'is-error' : ''}`}>
                      {groupMessage.text}
                    </div>
                  )}

                  {isGroupFormVisible && (
                    <section className="sv-users-create-card">
                      <div className="sv-users-form__header">
                        <h4>Create Group</h4>
                      </div>
                      <form className="sv-form-grid" onSubmit={submitGroupForm}>
                        <label className="sv-field">
                          <span>Group Name</span>
                          <input
                            value={groupFormValues.name}
                            onChange={(event) => handleGroupFieldChange('name', event.target.value)}
                            required
                          />
                        </label>
                        <label className="sv-field sv-field--full">
                          <span>Description (optional)</span>
                          <textarea
                            value={groupFormValues.description}
                            onChange={(event) => handleGroupFieldChange('description', event.target.value)}
                            placeholder="Optional notes about this group"
                          />
                        </label>
                        <label className="sv-field">
                          <span>Group Manager</span>
                          <select
                            value={groupFormValues.managerId === '' ? '' : String(groupFormValues.managerId)}
                            onChange={(event) => handleGroupFieldChange('managerId', event.target.value)}
                            required
                          >
                            <option value="">Select manager</option>
                            {activeGroupUserOptions.map((userOption) => (
                              <option key={userOption.id} value={userOption.id}>
                                {userOption.name} ({userOption.roleLabel})
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="sv-field sv-field--full">
                          <span>Add Users to Group</span>
                          {activeGroupUserOptions.length ? (
                            <div className="sv-expanded-list sv-expanded-list--scroll">
                              {activeGroupUserOptions.map((userOption) => (
                                <label key={userOption.id} className="sv-checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={(groupFormValues.userIds ?? []).includes(userOption.id)}
                                    onChange={(event) =>
                                      handleGroupUserSelection(userOption.id, event.target.checked)
                                    }
                                  />
                                  <span>
                                    {userOption.name} · {userOption.roleLabel}
                                  </span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <small>No active users available. Add users in Emplyees Management first.</small>
                          )}
                        </div>

                        <div className="sv-form-actions">
                          <button type="submit" disabled={isSavingGroup || !activeGroupUserOptions.length}>
                            {isSavingGroup ? 'Saving…' : 'Create group'}
                          </button>
                          <button type="button" onClick={handleCancelGroupForm} disabled={isSavingGroup}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    </section>
                  )}

                  <section className="sv-users-panel sv-users-panel--wide">
                    <div className="sv-users-panel__toolbar">
                      <div>
                        <h4>All Groups</h4>
                        <small>{groups.length} total</small>
                      </div>
                    </div>

                    <div className="sv-users-table-wrapper">
                      <table className="sv-users-table">
                        <thead>
                          <tr>
                            <th>Group Name</th>
                            <th>Description</th>
                            <th>Group Manager</th>
                            <th>Total Members</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((group) => {
                            const validMembers = (group.userIds ?? [])
                              .map((userId) => normalizeNumericId(userId))
                              .filter((userId) => userId !== null)
                              .map((userId) => usersById.get(userId))
                              .filter((member) => member && !isArchivedUser(member))

                            const memberNames = validMembers.map(
                              (member) => [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Unnamed user',
                            )
                            const managerRecord = group.managerId ? usersById.get(group.managerId) : null
                            const managerName = managerRecord
                              ? [managerRecord.firstName, managerRecord.lastName].filter(Boolean).join(' ') || 'Unnamed user'
                              : 'Unassigned'

                            return (
                              <tr key={group.id}>
                                <td>
                                  <span className="sv-chip">{group.name}</span>
                                </td>
                                <td>{group.description || 'No description provided.'}</td>
                                <td>{managerName}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="sv-mini-btn"
                                    onClick={() => setActiveGroupMembersGroupId(group.id)}
                                  >
                                    {validMembers.length}
                                  </button>
                                </td>
                                <td>
                                  <div className="sv-row-actions">
                                    <button
                                      type="button"
                                      className="sv-mini-btn is-primary"
                                      onClick={() => handleEditGroup(group.id)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="sv-mini-btn is-danger"
                                      onClick={() => handleDeleteGroup(group.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {!groups.length && (
                            <tr>
                              <td colSpan={5} className="sv-empty">
                                No groups created yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {isEditGroupModalOpen && (
                    <div className="sv-users-modal" role="dialog" aria-modal="true" aria-labelledby="svGroupEditTitle">
                      <div className="sv-users-modal__backdrop" onClick={handleCancelEditGroupForm} aria-hidden="true" />
                      <section className="sv-users-form sv-users-modal__panel">
                        <div className="sv-users-form__header">
                          <h4 id="svGroupEditTitle">Edit Group</h4>
                          <button
                            type="button"
                            className="sv-users-modal__close"
                            onClick={handleCancelEditGroupForm}
                            disabled={isSavingGroup}
                          >
                            Close
                          </button>
                        </div>

                        <form className="sv-form-grid" onSubmit={submitEditGroupForm}>
                          <label className="sv-field">
                            <span>Group Name</span>
                            <input
                              value={editGroupFormValues.name}
                              onChange={(event) => handleEditGroupFieldChange('name', event.target.value)}
                              required
                            />
                          </label>
                          <label className="sv-field sv-field--full">
                            <span>Description (optional)</span>
                            <textarea
                              value={editGroupFormValues.description}
                              onChange={(event) => handleEditGroupFieldChange('description', event.target.value)}
                              placeholder="Optional notes about this group"
                            />
                          </label>
                          <label className="sv-field">
                            <span>Group Manager</span>
                            <select
                              value={editGroupFormValues.managerId === '' ? '' : String(editGroupFormValues.managerId)}
                              onChange={(event) => handleEditGroupFieldChange('managerId', event.target.value)}
                              required
                            >
                              <option value="">Select manager</option>
                              {activeGroupUserOptions.map((userOption) => (
                                <option key={userOption.id} value={userOption.id}>
                                  {userOption.name} ({userOption.roleLabel})
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="sv-field sv-field--full">
                            <span>Add Users to Group</span>
                            {activeGroupUserOptions.length ? (
                              <div className="sv-expanded-list sv-expanded-list--scroll">
                                {activeGroupUserOptions.map((userOption) => (
                                  <label key={userOption.id} className="sv-checkbox-row">
                                    <input
                                      type="checkbox"
                                      checked={(editGroupFormValues.userIds ?? []).includes(userOption.id)}
                                      onChange={(event) =>
                                        handleEditGroupUserSelection(userOption.id, event.target.checked)
                                      }
                                    />
                                    <span>
                                      {userOption.name} · {userOption.roleLabel}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <small>No active users available. Add users in Emplyees Management first.</small>
                            )}
                          </div>

                          <div className="sv-form-actions">
                            <button type="submit" disabled={isSavingGroup || !activeGroupUserOptions.length}>
                              {isSavingGroup ? 'Saving…' : 'Update group'}
                            </button>
                            <button type="button" onClick={handleCancelEditGroupForm} disabled={isSavingGroup}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      </section>
                    </div>
                  )}

                  {activeGroupMembersGroupId && (
                    <div className="sv-users-modal" role="dialog" aria-modal="true" aria-labelledby="svGroupMembersTitle">
                      <div
                        className="sv-users-modal__backdrop"
                        onClick={() => setActiveGroupMembersGroupId(null)}
                        aria-hidden="true"
                      />
                      <section className="sv-users-form sv-users-modal__panel">
                        <div className="sv-users-form__header">
                          <h4 id="svGroupMembersTitle">Group Members</h4>
                          <button
                            type="button"
                            className="sv-users-modal__close"
                            onClick={() => setActiveGroupMembersGroupId(null)}
                          >
                            Close
                          </button>
                        </div>
                        <ul className="sv-group-members-grid">
                          {activeGroupMembers.map((member) => {
                              const memberName =
                                [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Unnamed user'
                              return (
                                <li key={member.id} className="sv-group-members-grid__item">
                                  <div>
                                    <p>{memberName}</p>
                                    <small>{formatRoleLabel(member.role)}</small>
                                  </div>
                                </li>
                              )
                            })}
                          {!activeGroupMembers.length && <li className="sv-empty">No active members in this group.</li>}
                        </ul>
                      </section>
                    </div>
                  )}
                </section>
              ) : activeSiteAdminPanel === 'Departments' ? (
                <section className="sv-card sv-card--full sv-admin-card">
                  <div className="sv-card__header">
                    <h3>Departments</h3>
                    <small>Track department ownership and operational status.</small>
                  </div>
                  <ul className="sv-list">
                    <li>
                      <div>
                        <span className="sv-chip">Community Living</span>
                        <p>Owner: Program Director · Status: Active</p>
                      </div>
                    </li>
                    <li>
                      <div>
                        <span className="sv-chip">Administration</span>
                        <p>Owner: Operations Manager · Status: Active</p>
                      </div>
                    </li>
                    <li>
                      <div>
                        <span className="sv-chip">Quality Assurance</span>
                        <p>Owner: Compliance Lead · Status: Active</p>
                      </div>
                    </li>
                  </ul>
                </section>
              ) : (
                <section className="sv-card sv-card--full sv-card--placeholder">
                  <p>
                    The {activeSiteAdminPanel} workspace is ready for future data connections. Return to the Emplyees
                    Management tab to manage users, or wire this section to the appropriate API when available.
                  </p>
                </section>
              )}
            </>
          ) : (
            <div className="sv-page-placeholder">
              <h2>{activeSectionLabel}</h2>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default HomeDashboard
