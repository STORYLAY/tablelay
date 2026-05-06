"use client";
// ... existing imports ...
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import Sidebar from './components/Sidebar';
import GridView from './components/GridView';
import KanbanView from './components/KanbanView';
import CalendarView from './components/CalendarView';
import GalleryView from './components/GalleryView';
import GanttView from './components/GanttView';
import DashboardView from './components/DashboardView';
import { Table, ViewType, FieldType, Column, Row, ViewMetadata, FilterCondition, SortCondition, GroupCondition, ColorRule, RowHeight, Comment } from './types';
import { ICONS } from './constants';
import { api } from './services/api';
import { debounce } from 'lodash-es';
// ... other imports ...
import FieldConfigDialog from './components/FieldConfigDialog';
import ViewConfigDialog from './components/ViewConfigDialog';
import TemplateDialog from './components/TemplateDialog';
import PublishTemplateDialog from './components/PublishTemplateDialog';
import ImportDialog from './components/ImportDialog';
import CommentDialog from './components/CommentDialog';
import TokenConfigDialog from './components/TokenConfigDialog';
import ConfirmDialog from './components/ConfirmDialog';
import OnboardingTour, { TourStep } from './components/OnboardingTour';
import { evaluateFormula } from './formulaUtils';
import CollaboratorDialog from './components/CollaboratorDialog';
import { 
  FilterMenu, SortMenu, GroupMenu, SimpleGroupMenu, ColorMenu, RowHeightMenu, 
  CalendarAppearanceMenu, CalendarSettingMenu, GanttSettingMenu, GallerySettingMenu,
  FieldMenu 
} from './components/ViewMenus';

import RowDetailPanel from './components/RowDetailPanel';
import { Toaster, toast } from 'sonner';
import { ClickOutsideWrapper } from './components/ClickOutsideWrapper';

// Helper to flatten tree if needed or find in tree
const findRowInTree = (rows: Row[], id: string): Row | undefined => {
    for (const row of rows) {
        if (row.id === id) return row;
        if (row.children) {
            const found = findRowInTree(row.children, id);
            if (found) return found;
        }
    }
    return undefined;
};

const flattenRows = (rows: Row[]): Row[] => {
    let result: Row[] = [];
    for (const row of rows) {
        result.push(row);
        if (row.children && row.children.length > 0) {
            result = result.concat(flattenRows(row.children));
        }
    }
    return result;
};

const buildRowTree = (flatRows: Row[]): Row[] => {
    const rowMap = new Map<string, Row>();
    const rootRows: Row[] = [];
    const uniqueRows: Row[] = [];
    const seenIds = new Set<string>();

    flatRows.forEach(row => {
        if (!seenIds.has(row.id)) {
            seenIds.add(row.id);
            uniqueRows.push(row);
        }
    });

    // First pass: create map and initialize children array
    uniqueRows.forEach(row => {
        rowMap.set(row.id, { ...row, children: [] });
    });

    // Second pass: link children to parents
    uniqueRows.forEach(row => {
        const rowWithChildren = rowMap.get(row.id)!;
        if (row.parent_id && rowMap.has(row.parent_id)) {
            const parent = rowMap.get(row.parent_id)!;
            parent.children = parent.children || [];
            parent.children.push(rowWithChildren);
        } else {
            rootRows.push(rowWithChildren);
        }
    });

    // We do NOT sort by index here because the API already returns the rows 
    // in the correct sorted order based on the view's sort configuration.
    // Sorting by index would override the view's sort order.

    return rootRows;
};

const flattenTree = (nodes: Row[]): Row[] => {
    let flat: Row[] = [];
    nodes.forEach(node => {
        const { children, ...rest } = node;
        flat.push(rest as Row);
        if (children && children.length > 0) {
            flat = flat.concat(flattenTree(children));
        }
    });
    return flat;
};

const App: React.FC = () => {
  // --- Data State ---
  const [tables, setTables] = useState<Table[]>([]);
  // ... existing state ...
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const activeTableIdRef = useRef(activeTableId);
  useEffect(() => { activeTableIdRef.current = activeTableId; }, [activeTableId]);
  
  // Full details for the active table
  const [activeTable, setActiveTable] = useState<Table | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRowsCount, setTotalRowsCount] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const [hasMore, setHasMore] = useState(false);
  const dragControls = useDragControls();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = e.clientX - startX.current;
      const newWidth = startWidth.current + deltaX;
      if (newWidth > 160 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isSidebarOpen) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSidebarOpen]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // --- UI State ---
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null); // If null, adding new
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplateTypeId, setSelectedTemplateTypeId] = useState<string | undefined>(undefined);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [fieldConfigAnchor, setFieldConfigAnchor] = useState<{ top: number, left: number } | null>(null);
  const [commentDialogState, setCommentDialogState] = useState<{ isOpen: boolean, rowId: string, colId: string } | null>(null);
  const [currentComments, setCurrentComments] = useState<any[]>([]); // New state for comments
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [isCollaboratorDialogOpen, setIsCollaboratorDialogOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isSuperTenant, setIsSuperTenant] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [activeDetailRowId, setActiveDetailRowId] = useState<string | null>(null);
  const [isCreatingNewRow, setIsCreatingNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [rowSearchKeyword, setRowSearchKeyword] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Fetch profile to check super admin status
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.getProfile();
        if (res) {
          // @ts-ignore
          setIsSuperAdmin(res.is_super_admin || res.data?.is_super_admin);
          // @ts-ignore
          setIsSuperTenant(res.is_super_tenant || res.data?.is_super_tenant);
        }
      } catch (err) {
        console.error("Failed to fetch profile", err);
      }
    };
    fetchProfile();
  }, []);

  // View Context Menu State (moved from Sidebar)
  const [viewContextMenu, setViewContextMenu] = useState<{ x: number, y: number, viewId: string } | null>(null);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingViewName, setEditingViewName] = useState('');
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
  const [dragOverViewId, setDragOverViewId] = useState<string | null>(null);
  const viewInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (editingViewId && viewInputRef.current) {
          viewInputRef.current.focus();
          viewInputRef.current.select();
      }
  }, [editingViewId]);

  const getViewIcon = (type: ViewType) => {
    switch (type) {
      case ViewType.GRID: return <ICONS.Grid />;
      case ViewType.KANBAN: return <ICONS.Kanban />;
      case ViewType.CALENDAR: return <ICONS.Calendar />;
      case ViewType.DASHBOARD: return <ICONS.Dashboard />;
      case ViewType.GALLERY: return <ICONS.Gallery />;
      case ViewType.GANTT: return <ICONS.Gantt />;
      default: return <ICONS.Grid />;
    }
  };

  const handleViewContextMenu = (e: React.MouseEvent, viewId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setViewContextMenu({ x: e.clientX, y: e.clientY, viewId });
  };

  const handleViewRenameStart = (viewId: string, currentName: string) => {
      setEditingViewId(viewId);
      setEditingViewName(currentName);
      setViewContextMenu(null);
  };

  const handleViewRenameSubmit = () => {
      if (editingViewId && editingViewName.trim()) {
          handleRenameView(editingViewId, editingViewName.trim());
      }
      setEditingViewId(null);
  };

  const handleViewKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleViewRenameSubmit();
      if (e.key === 'Escape') setEditingViewId(null);
  };

  const handleRowSearch = useMemo(() => debounce((val: string) => {
      setRowSearchKeyword(val);
  }, 300), []);

  // Fetch departments on mount
  useEffect(() => {
      const fetchDepts = async () => {
          try {
              const res = await api.getDepts();
              if (res.data) {
                  setDepartments(res.data.map((d: any) => ({ id: d.dept_id, name: d.dept_name })));
              }
          } catch (e) {
              console.error("Failed to fetch departments", e);
          }
      };
      fetchDepts();
  }, []);

  // Derived
  const activeView = activeTable?.views?.find(v => v.id === activeViewId);

  const fetchUndoRedoStatus = useCallback(async () => {
    if (!activeTableId) return;
    try {
      const res = await api.getUndoRedoStatus(activeTableId);
      if (res.data) {
        setCanUndo(res.data.can_undo);
        setCanRedo(res.data.can_redo);
      }
    } catch (err) {
      console.error("Failed to fetch undo/redo status", err);
    }
  }, [activeTableId]);

  // --- Auth & Initial Load ---
  useEffect(() => {
      const handleUnauthorized = () => setIsTokenDialogOpen(true);
      window.addEventListener('api:unauthorized', handleUnauthorized);
      return () => window.removeEventListener('api:unauthorized', handleUnauthorized);
  }, []);

  // --- Initial Data Fetch ---
  const fetchTables = useCallback(async (keyword?: string) => {
    try {
      const res = await api.getTables({ keyword });
      // Handle different possible response structures
      const tableList = (res.data?.list || res.data || (Array.isArray(res) ? res : [])) as Table[];
      setTables(tableList);
      
      if (tableList.length > 0 && !activeTableIdRef.current) {
        setActiveTableId(tableList[0].id);
      }
      return tableList;
    } catch (err) {
      console.error("Failed to fetch tables", err);
      return [];
    }
  }, []);

  const handleSearch = useMemo(() => debounce((keyword: string) => {
      fetchTables(keyword);
  }, 300), [fetchTables]);

  useEffect(() => {
    fetchTables().finally(() => setIsInitializing(false));
  }, [fetchTables]);

  // ... fetchTableDetail ...
  const fetchTableDetail = useCallback(async (id: string) => {
    setLoading(true);
    setRows([]); 
    
    try {
      const res = await api.getTableDetail(id);
      const detailedTable = res.data;
      
      // Auto-fix backend type for Department and hydrate frontend type
      if (detailedTable.columns) {
          for (const col of detailedTable.columns) {
              if (col.type === FieldType.DEPARTMENT) {
                  // Found a broken column (legacy), fix it by converting to TEXT
                  // We do this silently in the background
                  try {
                      await api.updateColumn(id, col.id, {
                          type: FieldType.TEXT,
                          config: { ...col.config, originalType: FieldType.DEPARTMENT }
                      });
                      // Update local state to reflect the fix
                      col.type = FieldType.DEPARTMENT; 
                      col.config = { ...col.config, originalType: FieldType.DEPARTMENT };
                  } catch (e) {
                      console.error("Failed to auto-fix Department column", e);
                  }
              } else if (col.config?.originalType === FieldType.DEPARTMENT) {
                  // Hydrate frontend type from config
                  col.type = FieldType.DEPARTMENT;
              }
          }
          // Ensure columns are sorted by their sort index
          detailedTable.columns.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      }

      setActiveTable(detailedTable);
      setTables(prev => prev.map(t => t.id === id ? { ...t, ...detailedTable } : t));

      if (detailedTable.views && detailedTable.views.length > 0) {
        setActiveViewId(prev => {
            const viewExists = detailedTable.views.find(v => v.id === prev);
            if (viewExists) return prev;
            const defaultView = detailedTable.views.find(v => v.is_default);
            return defaultView ? defaultView.id : detailedTable.views[0].id;
        });
      } else {
        setActiveViewId(null);
      }
    } catch (err) {
      console.error("Failed to fetch table details", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTableId) {
      fetchTableDetail(activeTableId);
    } else {
        setActiveTable(null);
        setRows([]);
    }
  }, [activeTableId, fetchTableDetail]);

  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const fetchAllComments = useCallback(async () => {
      if (!activeTableId) return;
      try {
          // Fetch comment counts for the table
          const res = await api.getCommentCounts(activeTableId);
          const countsData = res.data;
          
          const newCounts: Record<string, number> = {};
          countsData.forEach(item => {
              if (item.row_id && item.column_id) {
                  newCounts[`${item.row_id}_${item.column_id}`] = item.total;
              }
          });
          setCommentCounts(newCounts);
      } catch (err) {
          // Suppress error if the endpoint is not implemented or fails
          console.warn("Failed to fetch comment counts, continuing without them.");
      }
  }, [activeTableId]);

  const getValidFilters = (filters?: FilterCondition[], columns?: Column[]) => {
    if (!filters) return [];
    return filters.filter(f => {
      if (!f.column_id || !f.operator) return false;
      const unary = ['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'];
      if (unary.includes(f.operator)) return true;
      if (Array.isArray(f.value)) return f.value.length > 0;
      
      if (columns) {
         const col = columns.find(c => c.id === f.column_id);
         if (col && col.type === FieldType.CHECKBOX) {
             return f.value !== undefined && f.value !== null; // allow false, '', etc.
         }
      }
      return f.value !== undefined && f.value !== '' && f.value !== null;
    }).map(f => {
      if (!columns) return f;
      const col = columns.find(c => c.id === f.column_id);
      
      if (col && col.type === FieldType.CHECKBOX) {
        let op = f.operator;
        let isChecked = f.value === true || f.value === 'true';
        let v = isChecked ? 'true' : ''; 
        return { ...f, operator: op, value: v };
      }
      
      if (col && col.type === FieldType.USER) {
        let newValue = f.value;
        if (Array.isArray(f.value)) {
          newValue = f.value.map(v => typeof v === 'object' && v !== null ? (v.id || v) : v);
        } else if (typeof f.value === 'object' && f.value !== null) {
          newValue = f.value.id || f.value;
        }
        return { ...f, value: newValue };
      }
      return f;
    });
  };

  // --- Fetch Rows (Applying View Config) ---
  const fetchRows = useCallback(async (pageNumber = 1, reloadAll = false) => {
    if (!activeTableId || !activeView || !activeTable || activeTable.id !== activeTableId) return;
    try {
      if (pageNumber === 1) {
        setLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const pageSize = activeView.type === ViewType.KANBAN ? 1000 : 50;
      const fetchPage = reloadAll ? 1 : pageNumber;
      const fetchPageSize = reloadAll ? pageRef.current * pageSize : pageSize;

      const useServerGrouping = activeView.config?.groups && activeView.config.groups.length > 0 && activeView.type !== ViewType.KANBAN;

      // Identify Department and User columns for parsing
      const deptCols = activeTable.columns.filter(c => c.type === FieldType.DEPARTMENT);
      const userCols = activeTable.columns.filter(c => c.type === FieldType.USER);

      if (useServerGrouping) {
          // Use group API
          const res = await api.groupRows(activeTableId, {
              groups: activeView.config?.groups || [],
              filters: getValidFilters(activeView.config?.filters, activeTable.columns),
              sorts: activeView.config?.sorts || [],
              search: rowSearchKeyword
          });
          
          if (res.data) {
              // Transform grouped data into tree structure for GridView
              const groupRows: Row[] = res.data.map((group: any, index: number) => {
                  // Parse Department and User fields in grouped rows
                  if (group.rows && (deptCols.length > 0 || userCols.length > 0)) {
                      group.rows.forEach((row: any) => {
                          deptCols.forEach(col => {
                              if (typeof row[col.id] === 'string') {
                                  try {
                                      let jsonStr = row[col.id];
                                      // Simple heuristic to fix Python dict string representation if needed
                                      if (jsonStr.includes("'")) {
                                          jsonStr = jsonStr.replace(/'/g, '"');
                                      }
                                      const parsed = JSON.parse(jsonStr);
                                      // Hydrate IDs to objects
                                      if (Array.isArray(parsed)) {
                                          row[col.id] = parsed.map((id: any) => {
                                              if (typeof id === 'object') return id;
                                              const dept = departments.find(d => d.id === id);
                                              return dept || { id, name: 'Unknown' };
                                          });
                                      } else if (typeof parsed === 'object') {
                                          row[col.id] = parsed;
                                      } else {
                                          const dept = departments.find(d => d.id === parsed);
                                          row[col.id] = dept || { id: parsed, name: 'Unknown' };
                                      }
                                  } catch (e) { /* ignore */ }
                              }
                          });
                          userCols.forEach(col => {
                              if (typeof row[col.id] === 'string') {
                                  try {
                                      let jsonStr = row[col.id];
                                      if (jsonStr.startsWith('[') || jsonStr.startsWith('{')) {
                                          if (jsonStr.includes("'")) {
                                              jsonStr = jsonStr.replace(/'/g, '"');
                                          }
                                          row[col.id] = JSON.parse(jsonStr);
                                      }
                                  } catch (e) { /* ignore */ }
                              }
                          });
                      });
                  }

                  const groupKeyValues = Array.isArray(group.key) ? group.key : (group.key?.value || []);
                  const groupId = `group_${index}_${groupKeyValues.join('_')}`;
                  return {
                      id: groupId,
                      isGroup: true,
                      groupKey: group.key,
                      data: { count: group.count },
                      children: buildRowTree(group.rows || [])
                  };
              });
              setRows(groupRows);
              setHasMore(false);
              setTotalRowsCount(res.data.reduce((acc: number, cur: any) => acc + (cur.count || 0), 0));
              fetchAllComments();
          }
      } else {
          // Normal fetch
          const res = await api.getRows(activeTableId, {
            page: fetchPage,
            page_size: fetchPageSize, 
            filters: getValidFilters(activeView.config?.filters, activeTable.columns),
            sorts: activeView.config?.sorts || [],
            search: rowSearchKeyword
          });
          if (res.data?.list) {
              // Parse Department and User fields
              if (deptCols.length > 0 || userCols.length > 0) {
                  res.data.list.forEach((row: any) => {
                      deptCols.forEach(col => {
                          if (typeof row[col.id] === 'string') {
                              try {
                                  let jsonStr = row[col.id];
                                  if (jsonStr.includes("'")) {
                                      jsonStr = jsonStr.replace(/'/g, '"');
                                  }
                                  const parsed = JSON.parse(jsonStr);
                                  // Hydrate IDs to objects
                                  if (Array.isArray(parsed)) {
                                      row[col.id] = parsed.map((id: any) => {
                                          if (typeof id === 'object') return id;
                                          const dept = departments.find(d => d.id === id);
                                          return dept || { id, name: 'Unknown' };
                                      });
                                  } else if (typeof parsed === 'object') {
                                      row[col.id] = parsed;
                                  } else {
                                      const dept = departments.find(d => d.id === parsed);
                                      row[col.id] = dept || { id: parsed, name: 'Unknown' };
                                  }
                              } catch (e) { /* ignore */ }
                          }
                      });
                      userCols.forEach(col => {
                          if (typeof row[col.id] === 'string') {
                              try {
                                  let jsonStr = row[col.id];
                                  if (jsonStr.startsWith('[') || jsonStr.startsWith('{')) {
                                      if (jsonStr.includes("'")) {
                                          jsonStr = jsonStr.replace(/'/g, '"');
                                      }
                                      row[col.id] = JSON.parse(jsonStr);
                                  }
                              } catch (e) { /* ignore */ }
                          }
                      });
                  });
              }

              if (pageNumber === 1 || reloadAll) {
                  const tree = buildRowTree(res.data.list);
                  setRows(tree);
              } else {
                  setRows(prev => {
                      const flatPrev = flattenTree(prev);
                      const combined = [...flatPrev, ...res.data.list];
                      return buildRowTree(combined);
                  });
              }
              
              if (!reloadAll) {
                  setPage(pageNumber);
                  pageRef.current = pageNumber;
              }
              
              if (res.data.total !== undefined) {
                  setHasMore(pageRef.current * pageSize < res.data.total);
                  setTotalRowsCount(res.data.total);
              } else {
                  setHasMore(res.data.list.length === fetchPageSize);
                  setTotalRowsCount(undefined);
              }
              
              // Fetch comments after rows are loaded
              fetchAllComments();
          }
      }
    } catch (err) {
      console.error("Failed to fetch rows", err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeTableId, activeView, activeTable, fetchAllComments, departments, rowSearchKeyword]);

  useEffect(() => {
    fetchRows();
    fetchUndoRedoStatus();
  }, [fetchRows, fetchUndoRedoStatus]);

  const handleUndo = useCallback(async () => {
    if (!activeTableId || !canUndo) return;
    try {
      await api.undo(activeTableId);
      // Refresh data and status
      await fetchTableDetail(activeTableId);
      await fetchRows(1, true);
      await fetchUndoRedoStatus();
    } catch (err: any) {
      console.error("Undo failed", err);
      // Handle "No undoable actions" error gracefully
      if (err.message && (err.message.includes('没有可撤回的操作') || err.message.includes('No undoable actions'))) {
          await fetchUndoRedoStatus(); // Sync status
      }
    }
  }, [activeTableId, canUndo, fetchTableDetail, fetchRows, fetchUndoRedoStatus]);

  const handleRedo = useCallback(async () => {
    if (!activeTableId || !canRedo) return;
    try {
      await api.redo(activeTableId);
      // Refresh data and status
      await fetchTableDetail(activeTableId);
      await fetchRows(1, true);
      await fetchUndoRedoStatus();
    } catch (err: any) {
      console.error("Redo failed", err);
      // Handle "No redoable actions" error gracefully
      if (err.message && (err.message.includes('没有可恢复的操作') || err.message.includes('No redoable actions'))) {
          await fetchUndoRedoStatus(); // Sync status
      }
    }
  }, [activeTableId, canRedo, fetchTableDetail, fetchRows, fetchUndoRedoStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTokenDialogOpen && (e.ctrlKey || e.metaKey)) {
        if (e.key.toLowerCase() === 'z') {
          // Check if editing text
          const activeEl = document.activeElement;
          const isInput = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            (activeEl as HTMLElement).isContentEditable
          );
          if (isInput) return;
          
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          const activeEl = document.activeElement;
          const isInput = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            (activeEl as HTMLElement).isContentEditable
          );
          if (isInput) return;

          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, isTokenDialogOpen]);

  // ... Tour Steps ...
  const tourSteps: TourStep[] = [
    { target: '#tour-sidebar-workspaces', title: '1. 工作区与项目', content: '欢迎使用！左侧是您的工作台。您可以在这里创建新的数据表，或者在不同的项目之间进行切换。' },
    { target: '#tour-sidebar-views', title: '2. 多维视图', content: '同一个数据表可以有多种展现形式。您可以根据需要，将数据切换为表格、看板、日历或甘特图等视图，方便从不同角度管理数据。' },
    { target: '#tour-toolbar', title: '3. 视图工具栏', content: '在上方工具栏中，您可以对当前视图的数据进行筛选、排序和分组，还可以配置显示的字段。这些设置会自动保存在当前视图中。' },
    { target: '#tour-main-content', title: '4. 数据编辑区', content: '这里是核心的数据操作区。您可以像使用 Excel 一样，直接点击单元格进行编辑，或者拖拽调整行和列的顺序。' }
  ];

  // ... Handlers (Table, View, Column, Row) ...
  const handleAddTable = async () => {
    try {
      const newTablePayload = {
        name: '新数据表',
        columns: [
          { name: '名称', type: FieldType.TEXT, width: 200 },
          { name: '状态', type: FieldType.SELECT, config: { options: ['未开始', '进行中', '已完成'] } }
        ],
        views: [{ name: '表格视图', type: ViewType.GRID }]
      };
      const oldTableIds = new Set(tables.map(t => t.id));
      const res = await api.createTable(newTablePayload);
      const newTableList = await fetchTables();
      
      const newTableId = res.data?.id || (res as any).id;
      if (newTableId) {
        setActiveTableId(newTableId);
      } else {
        const newlyCreatedTable = newTableList.find((t: any) => !oldTableIds.has(t.id));
        if (newlyCreatedTable) {
          setActiveTableId(newlyCreatedTable.id);
        } else if (newTableList.length > 0) {
          setActiveTableId(newTableList[0].id);
        }
      }
    } catch (err) { console.error('创建失败', err); }
  };

  const handleImportTable = async (data: any) => {
    setIsImportDialogOpen(false);
    
    const toastId = toast('解析中...', {
      icon: <svg className="animate-spin h-4 w-4 text-yellow-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
      duration: 999999,
      style: {
        backgroundColor: '#fdf6ec',
        color: '#e6a23c',
        borderColor: '#faecd8',
      }
    });

    try {
      const res = await api.importMultiDimensionalData(data);
      await fetchTables();
      if (res.data && res.data.id) {
          setActiveTableId(res.data.id);
      }
      toast.success('导入成功', { id: toastId, duration: 3000 });
    } catch (err: any) { 
      console.error('导入失败', err); 
      toast.error(err.message || '导入失败，请检查文件格式或重试。', { id: toastId, duration: 4000 });
    }
  };

  // Interface 31: Use Template API
  const handleTemplateSelect = async (template: Table, typeId: string) => {
    try {
      setLoading(true);
      // Use the API to create the table from the template ID
      const res = await api.createTableFromTemplate(template.id, {
        name: template.name,
        type_id: typeId
      });
      
      // The API might return the table directly, wrapped in a data property, or just the ID string
      const newTableId = res.data?.id || (typeof res.data === 'string' ? res.data : null) || (res as any).id || (typeof res === 'string' ? res : null);
      
      if (newTableId) {
        toast.success(`模版 "${template.name}" 已成功创建为新表格`);
        setIsTemplateDialogOpen(false);
        setSelectedTemplateTypeId(undefined);
        await fetchTables();
        setActiveTableId(newTableId);
      } else {
        // If we can't find the ID but the request didn't throw, assume success and refresh anyway
        toast.success(`模版 "${template.name}" 已成功创建`);
        setIsTemplateDialogOpen(false);
        setSelectedTemplateTypeId(undefined);
        
        // Find the newly created table by comparing old and new table lists
        const oldTableIds = new Set(tables.map(t => t.id));
        const newTableList = await fetchTables();
        const newlyCreatedTable = newTableList.find((t: any) => !oldTableIds.has(t.id));
        
        if (newlyCreatedTable) {
          setActiveTableId(newlyCreatedTable.id);
        } else if (newTableList.length > 0) {
          // Fallback to the first table if we can't determine the new one
          setActiveTableId(newTableList[0].id);
        }
      }
    } catch (err: any) { 
      console.error('使用模版失败', err); 
      if (err.message !== 'Unauthorized') {
        toast.error(err.message || '创建失败，请确保您已配置有效的 Token。');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRenameTable = async (id: string, newName: string) => {
    try {
      await api.updateTable(id, { name: newName });
      fetchTables(); 
    } catch (err) { console.error(err); }
  };

  const handleDeleteTable = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除项目',
      message: '确定要删除此数据表项目吗？此操作无法撤销。',
      onConfirm: async () => {
        try {
            await api.deleteTable(id);
            if (activeTableId === id) setActiveTableId(null);
            fetchTables();
        } catch (err: any) { 
            console.error('删除失败', err); 
            toast.error(err.message || '删除失败');
        }
        setConfirmDialog(null);
      }
    });
  };

  const handleDuplicateTable = async (id: string) => {
      try {
          const res = await api.duplicateTable(id);
          await fetchTables();
          setActiveTableId(res.data.id);
      } catch (err: any) {
          console.error("复制失败", err);
          toast.error(err.message || "复制失败");
      }
  };

  // --- Handlers: View ---
  const handleViewDragStart = (e: React.DragEvent, viewId: string) => {
      setDraggedViewId(viewId);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleViewDragOver = (e: React.DragEvent, viewId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedViewId !== viewId) {
          setDragOverViewId(viewId);
      }
  };

  const handleViewDragLeave = () => {
      setDragOverViewId(null);
  };

  const handleViewDrop = async (e: React.DragEvent, targetViewId: string) => {
      e.preventDefault();
      setDragOverViewId(null);
      if (!draggedViewId || draggedViewId === targetViewId || !activeTable) return;

      const views = [...(activeTable.views || [])];
      const draggedIndex = views.findIndex(v => v.id === draggedViewId);
      const targetIndex = views.findIndex(v => v.id === targetViewId);

      if (draggedIndex === -1 || targetIndex === -1) return;

      const [draggedView] = views.splice(draggedIndex, 1);
      views.splice(targetIndex, 0, draggedView);

      // Optimistic update
      setActiveTable(prev => prev ? { ...prev, views } : null);
      setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, views } : t));

      try {
          await api.moveView(activeTable.id, draggedViewId, targetIndex);
      } catch (err) {
          console.error('Failed to update view sort', err);
          // Revert on failure
          fetchTableDetail(activeTable.id);
      }
      setDraggedViewId(null);
  };

  const handleViewDragEnd = () => {
      setDraggedViewId(null);
      setDragOverViewId(null);
  };

  const handleAddView = () => setIsViewDialogOpen(true);
  
  const handleCreateView = async (viewData: Partial<ViewMetadata>) => {
    if (!activeTableId) return;
    try {
      const payload = {
          name: viewData.name || '新视图',
          type: viewData.type || ViewType.GRID,
          is_default: false,
          config: viewData.config || {}
      };
      const res = await api.createView(activeTableId, payload);
      await fetchTableDetail(activeTableId); 
      setActiveViewId(res.data.id);
      setIsViewDialogOpen(false);
    } catch (err: any) { 
        console.error('创建视图失败', err); 
        toast.error(err.message || '创建视图失败');
    }
  };

  const handleRenameView = async (viewId: string, newName: string) => {
      if (!activeTableId) return;
      try {
          await api.renameView(activeTableId, viewId, newName);
          fetchTableDetail(activeTableId);
      } catch(err: any) { 
          console.error('重命名视图失败', err); 
          toast.error(err.message || '重命名视图失败');
      }
  };

  const handleDeleteView = (viewId: string) => {
      if (!activeTable) return;
      if (activeTable.views && activeTable.views.length <= 1) {
          toast.error("至少保留一个视图");
          return;
      }
      setConfirmDialog({
          isOpen: true,
          title: '删除视图',
          message: '确定删除此视图吗？相关的视图配置将丢失。',
          onConfirm: async () => {
              try {
                  await api.deleteView(activeTable.id, viewId);
                  await fetchTableDetail(activeTable.id);
              } catch(err: any) { 
                  console.error('删除视图失败', err); 
                  toast.error(err.message || '删除视图失败');
              }
              setConfirmDialog(null);
          }
      });
  };

  const handleSaveAsNewView = async () => {
    if (!activeTableId || !activeView) return;
    try {
        await api.copyView(activeTableId, activeView.id);
        await fetchTableDetail(activeTableId);
        setOpenMenu(null);
    } catch(err: any) { 
        console.error('另存为失败', err); 
        toast.error(err.message || '另存为失败');
    }
  };

  const updateViewConfig = async (updates: Partial<ViewMetadata['config']>) => {
      if (!activeView || !activeTableId) return;
      
      // Create a new config object
      const newConfig = { ...activeView.config, ...updates };
      
      // Remove keys that are explicitly set to null
      Object.keys(updates).forEach(key => {
          if ((updates as any)[key] === null) {
              delete (newConfig as any)[key];
          }
      });
      
      setActiveTable(prev => prev ? {
          ...prev,
          views: prev.views?.map(v => v.id === activeViewId ? { ...v, config: newConfig } : v) || []
      } : null);
      
      try {
          // Filter out incomplete filters before sending to API to avoid backend errors
          const configToSave = { ...newConfig };
          if (configToSave.filters) {
              configToSave.filters = getValidFilters(configToSave.filters, activeTable.columns);
          }

          await api.updateView(activeTableId, activeView.id, { 
              config: configToSave, 
              is_default: activeView.is_default || false 
          });
          // fetchRows() is handled by useEffect when activeView changes via setActiveTable
      } catch(err: any) { 
          console.error('更新视图配置失败', err); 
          toast.error(err.message || '更新视图配置失败');
      }
  };

  // ... Column Handlers ...
  const handleAddColumn = () => {
    setEditingColumn(null);
    setIsFieldDialogOpen(true);
  };

  const handleSaveColumn = async (col: Column, isVisible: boolean) => {
    if (!activeTableId || !activeView || !activeTable || activeTable.id !== activeTableId) return;
    try {
        let savedColId = col.id;
        
        // 1. Save/Update Column
        const existingCol = activeTable?.columns.find(c => c.id === col.id);
        if (existingCol) {
            // Check if type changed
            if (existingCol.type !== col.type) {
                await api.convertColumnType(activeTableId, col.id, col.type);
            }
            await api.updateColumn(activeTableId, col.id, col);
        } else {
            const nextSort = activeTable ? activeTable.columns.length : 0;
            const colWithSort = { ...col, sort: nextSort };
            const res = await api.createColumn(activeTableId, colWithSort);
            savedColId = res.data.id;
        }

        // 1.5 Batch Update for Search Reference
        if (col.type === FieldType.SEARCH_REFERENCE && col.config?.search_reference_config) {
            await api.batchUpdateSearchReference(activeTableId, savedColId);
        }

        // 1.6 Batch Update for Formula
        if (col.type === FieldType.FORMULA && col.config?.formula) {
            const allLoadedRows = flattenRows(rows);
            if (allLoadedRows.length > 0) {
                // Ensure columns array includes the updated/new column
                let updatedCols = activeTable ? [...activeTable.columns] : [];
                const existIdx = updatedCols.findIndex(c => c.id === savedColId);
                if (existIdx >= 0) {
                    updatedCols[existIdx] = { ...col, id: savedColId };
                } else {
                    updatedCols.push({ ...col, id: savedColId });
                }

                const payload = allLoadedRows.map((r: Row) => {
                    const val = evaluateFormula(col.config.formula, updatedCols, r);
                    return {
                        row_id: r.id,
                        operation_type: 'update',
                        parent_id: r.parent_id || null,
                        data: {
                            [savedColId]: val
                        }
                    };
                });
                await api.batchProcessRows(activeTableId, payload);
            }
        }

        // 1.7 Batch Update for Checkbox (Default false for new columns)
        if (col.type === FieldType.CHECKBOX && !existingCol) {
            const allLoadedRows = flattenRows(rows);
            if (allLoadedRows.length > 0) {
                const payload = allLoadedRows.map((r: Row) => {
                    return {
                        row_id: r.id,
                        operation_type: 'update',
                        parent_id: r.parent_id || null,
                        data: {
                            [savedColId]: false
                        }
                    };
                });
                await api.batchProcessRows(activeTableId, payload);
            }
        }

        // 2. Update View Visibility
        // If visibleColumns is undefined, it means "Show All". 
        // We initialize it with all current columns to make it explicit.
        const allColIds = activeTable ? activeTable.columns.map(c => c.id) : [];
        // If creating new, add it to the "all" list for calculation
        if (!allColIds.includes(savedColId)) allColIds.push(savedColId);

        const currentVisible = activeView.config?.visibleColumns || allColIds;
        let newVisible = [...currentVisible];

        if (isVisible) {
            if (!newVisible.includes(savedColId)) {
                newVisible.push(savedColId);
            }
        } else {
            newVisible = newVisible.filter(id => id !== savedColId);
        }

        // Only update if changed or if we are transitioning from "Show All" (undefined) to explicit list
        if (JSON.stringify(newVisible) !== JSON.stringify(activeView.config?.visibleColumns)) {
             await updateViewConfig({ visibleColumns: newVisible });
        }

        await fetchTableDetail(activeTableId);
        // Refresh rows to show updated data (especially for Search Reference or Formula)
        await fetchRows(1, true);
        setIsFieldDialogOpen(false);
    } catch(err: any) { 
        console.error('保存字段失败', err); 
        toast.error(err.message || '保存字段失败');
    }
  };
  
  const handleDeleteColumn = async (colId: string) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return false;
      try {
          await api.deleteColumn(activeTableId, colId);
          await fetchTableDetail(activeTableId);
          return true;
      } catch(err: any) { 
          console.error('删除字段失败', err); 
          toast.error(err.message || '删除字段失败');
          return false;
      }
  };

  const handleDeleteColumns = async (colIds: string[]) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId || colIds.length === 0) return false;
      try {
          // 调用后端批量删除接口
          await api.batchDeleteColumns(activeTableId, colIds);
          
          await fetchTableDetail(activeTableId);
          toast.success(`成功删除 ${colIds.length} 个字段`);
          return true;
      } catch(err: any) { 
          console.error('批量删除字段失败', err); 
          toast.error(err.message || '批量删除字段失败');
          // Still fetch details to reflect partial deletions (if any)
          await fetchTableDetail(activeTableId);
          return false;
      }
  };
  
  const handleColumnSort = async (sortedColumns: Column[]) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const newColumns = sortedColumns.map((c, idx) => ({ ...c, sort: idx }));
      setActiveTable(prev => prev ? { ...prev, columns: newColumns } : null);
      setTables(prev => prev.map(t => t.id === activeTableId ? { ...t, columns: newColumns } : t));
      const payload = newColumns.map(c => ({ id: c.id, sort: c.sort || 0 }));
      try {
          await api.updateColumnSort(activeTableId, payload);
      } catch (err) {
          console.error("Sort failed", err);
          fetchTableDetail(activeTableId);
      }
  };

  const handleToggleColumnVisibility = (colId: string) => {
      if (!activeView) return;
      const currentVisible = activeView.config?.visibleColumns || activeTable!.columns.map(c => c.id);
      const isVisible = currentVisible.includes(colId);
      const newVisible = isVisible ? currentVisible.filter(id => id !== colId) : [...currentVisible, colId];
      updateViewConfig({ visibleColumns: newVisible });
  };

  const debouncedUpdateViewConfig = useMemo(
    () => debounce(async (tableId: string, viewId: string, config: any) => {
      try {
        await api.updateView(tableId, viewId, { config });
      } catch (err) {
        console.error('Debounced update failed', err);
      }
    }, 500),
    []
  );

  const handleColumnResize = (colId: string, width: number) => {
      if (!activeTableId || !activeViewId || !activeView || !activeTable || activeTable.id !== activeTableId) return;
      
      const currentWidths = activeView.config?.columnWidths || {};
      const newWidths = { ...currentWidths, [colId]: width };
      const newConfig = { ...activeView.config, columnWidths: newWidths };

      // Optimistic update
      setActiveTable(prev => {
          if (!prev) return null;
          return {
              ...prev,
              views: prev.views.map(v => v.id === activeViewId ? { ...v, config: newConfig } : v)
          };
      });

      debouncedUpdateViewConfig(activeTableId, activeViewId, newConfig);
  };

  // Helper to prepare data for backend (stringify complex types if needed)
  const prepareDataForBackend = (data: Record<string, any>, columns: Column[]) => {
      const processed = { ...data };

      // Evaluate formula fields so their calculated values are saved to backend
      columns.filter(c => c.type === FieldType.FORMULA).forEach(col => {
          const formula = col.config?.formula || col.formula || '';
          // Provide a dummy row object with the current data state for evaluation
          const displayVal = evaluateFormula(formula, columns, { id: 'temp', data: processed, parent_id: null, index: 0 });
          processed[col.id] = displayVal;
      });

      columns.forEach(col => {
          let val = processed[col.id];
          if (col.type === FieldType.CHECKBOX) {
              val = !!val;
              processed[col.id] = val;
          }
          if (!val && val !== 0 && val !== false) return; // Allow 0 and false for formulas/numbers fields

          if (col.type === FieldType.DEPARTMENT) {
              // Ensure it's an array of {id, name} objects as requested:
              // "field_id": [{"id": "...", "name": "..."}, ...]
              let depts: {id: string, name: string}[] = [];
              if (Array.isArray(val)) {
                  depts = val.map((v: any) => {
                      if (typeof v === 'object' && v !== null) {
                          return { id: v.id || v.dept_id, name: v.name || v.dept_name || v.id };
                      }
                      return { id: String(v), name: String(v) };
                  });
              } else if (typeof val === 'object' && val !== null) {
                  depts = [{ id: val.id || val.dept_id, name: val.name || val.dept_name || val.id }];
              } else if (val) {
                  depts = [{ id: String(val), name: String(val) }];
              }
              processed[col.id] = depts;
          } else if (col.type === FieldType.USER) {
              // Now only send IDs
              if (Array.isArray(val)) {
                  processed[col.id] = val.map((v: any) => (typeof v === 'object' && v !== null) ? v.id : String(v));
              } else if (typeof val === 'object' && val !== null) {
                  processed[col.id] = val.id;
              } else {
                  processed[col.id] = String(val);
              }
          }
      });
      return processed;
  };

  // ... Row Handlers ...
  const handleAddRow = async (initialData: Record<string, any> = {}, specificId?: string, index?: number) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
    
    const dataWithDefaults = { ...initialData };
    activeTable.columns.forEach(col => {
        const def = col.config?.defaultValue ?? col.defaultValue;
        if (def !== undefined && def !== null && def !== '' && dataWithDefaults[col.id] === undefined) {
            dataWithDefaults[col.id] = def;
        }
    });

    setNewRowData(dataWithDefaults);
    setIsCreatingNewRow(true);
    return null;
  };

  const handleDirectAddRow = async (initialData: Record<string, any> = {}, index?: number) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return null;
    
    const dataWithDefaults = { ...initialData };
    activeTable.columns.forEach(col => {
        const def = col.config?.defaultValue ?? col.defaultValue;
        if (def !== undefined && def !== null && def !== '' && dataWithDefaults[col.id] === undefined) {
            dataWithDefaults[col.id] = def;
        }
    });

    return await handleConfirmAddRow(dataWithDefaults, index);
  };

  const handleBatchProcessRows = async (payload: any[]) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      
      // Prepare data for backend
      const processedPayload = payload.map(item => ({
          ...item,
          data: prepareDataForBackend(item.data, activeTable.columns)
      }));

      try {
          await api.batchProcessRows(activeTableId, processedPayload);
          fetchRows(1, true);
          fetchUndoRedoStatus();
          toast.success('批量处理成功');
      } catch(err: any) {
          console.error('批量处理失败', err);
          toast.error(err.message || '批量处理失败');
      }
  };

  const handleConfirmAddRow = async (data: Record<string, any>, index?: number) => {
    if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
    
    const dataToSend = prepareDataForBackend(data, activeTable.columns);

    try {
        const res = await api.createRow(activeTableId, { 
            data: dataToSend,
            index: index,
            parent_id: null 
        });
        
        // Merge rich data (objects with name/avatar) from 'data' into 'res.data' for immediate correct display
        const richRowData = { ...res.data.data };
        activeTable.columns.forEach(col => {
            if ((col.type === FieldType.USER || col.type === FieldType.DEPARTMENT || col.type === FieldType.LINK || col.type === FieldType.ATTACHMENT) && data[col.id]) {
                richRowData[col.id] = data[col.id];
            }
        });
        const finalRow = { ...res.data, data: richRowData };

        setRows(prev => [...prev, finalRow]); 
        setTotalRowsCount(prev => prev !== undefined ? prev + 1 : undefined);
        
        // Let user manually refresh if grouping is wrong, or we handle group inject better
        // fetchRows(); // Refetch to ensure grouping is correct
        
        fetchUndoRedoStatus();
        setIsCreatingNewRow(false);
        setNewRowData({});
        toast.success('添加成功');
        return finalRow;
    } catch(err: any) { 
        console.error('添加行失败', err); 
        toast.error(err.message || '添加行失败');
        return null;
    }
  };

  const handleAddSubRow = async (parentId: string, initialData: Record<string, any> = {}) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const dataWithDefaults: Record<string, any> = { ...initialData };
      activeTable.columns.forEach(col => {
          const def = col.config?.defaultValue ?? col.defaultValue;
          if (def !== undefined && def !== null && def !== '' && dataWithDefaults[col.id] === undefined) {
              dataWithDefaults[col.id] = def;
          }
      });

      const dataToSend = prepareDataForBackend(dataWithDefaults, activeTable.columns);

      try {
          const parentRow = findRowInTree(rows, parentId);
          const nextIndex = parentRow?.children ? parentRow.children.length : 0;
          const res = await api.createRow(activeTableId, { 
              parent_id: parentId, 
              data: dataToSend,
              index: nextIndex
          });
          
          setRows(prev => {
              const updateRecursive = (list: Row[]): Row[] => {
                  return list.map(r => {
                      if (r.id === parentId) {
                          return { ...r, children: [...(r.children || []), res.data] };
                      }
                      if (r.children) {
                          return { ...r, children: updateRecursive(r.children) };
                      }
                      return r;
                  });
              };
              return updateRecursive(prev);
          });
          setTotalRowsCount(prev => prev !== undefined ? prev + 1 : undefined);
          fetchUndoRedoStatus();
      } catch(err: any) { 
          console.error('添加子记录失败', err); 
          toast.error(err.message || '添加子记录失败');
      }
  };

  const handleInsertRow = async (targetRowId: string, position: 'before' | 'after', initialData?: Record<string, any>, count: number = 1) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const dataWithDefaults = { ...(initialData || {}) };
      activeTable.columns.forEach(col => {
          const def = col.config?.defaultValue ?? col.defaultValue;
          if (def !== undefined && def !== null && def !== '' && dataWithDefaults[col.id] === undefined) {
              dataWithDefaults[col.id] = def;
          }
      });

      const dataToSend = prepareDataForBackend(dataWithDefaults, activeTable.columns);

      try {
          const targetRow = findRowInTree(rows, targetRowId);
          if (!targetRow) return;
          
          for (let i = 0; i < count; i++) {
              if (position === 'before') {
                  await api.insertRowAbove(activeTableId, {
                      data: dataToSend,
                      index: targetRow.index ?? 0,
                      parent_id: targetRow.parent_id || null
                  });
              } else {
                  await api.insertRowBelow(activeTableId, {
                      data: dataToSend,
                      index: targetRow.index ?? 0,
                      parent_id: targetRow.parent_id || null
                  });
              }
          }
          
          fetchRows(1, true);
          fetchUndoRedoStatus();
      } catch(err: any) { 
          console.error('插入行失败', err); 
          toast.error(err.message || '插入行失败');
      }
  };

  const handleDuplicateRow = async (targetRowId: string) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      try {
          await api.copyRow(activeTableId, targetRowId);
          fetchRows(1, true);
          fetchUndoRedoStatus();
      } catch(err: any) { 
          console.error('复制行失败', err); 
          toast.error(err.message || '复制行失败');
      }
  };

  const handleDeleteRow = async (rowId: string) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      try {
          await api.deleteRow(activeTableId, rowId);
          setRows(prev => {
              const deleteRecursive = (list: Row[]): Row[] => {
                  return list.filter(r => r.id !== rowId).map(r => {
                      if (r.children) {
                          return { ...r, children: deleteRecursive(r.children) };
                      }
                      return r;
                  });
              };
              return deleteRecursive(prev);
          });
          setTotalRowsCount(prev => prev !== undefined ? Math.max(0, prev - 1) : undefined);
          fetchUndoRedoStatus();
          toast.success('删除成功');
      } catch(err: any) { 
          console.error('删除失败', err); 
          toast.error(err.message || '删除失败');
      }
  };
  
  const handleDeleteRows = async (rowIds: string[]) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      try {
          await api.batchDeleteRows(activeTableId, rowIds);
          setRows(prev => {
              const deleteRecursive = (list: Row[]): Row[] => {
                  return list.filter(r => !rowIds.includes(r.id)).map(r => {
                      if (r.children) {
                          return { ...r, children: deleteRecursive(r.children) };
                      }
                      return r;
                  });
              };
              return deleteRecursive(prev);
          });
          setTotalRowsCount(prev => prev !== undefined ? Math.max(0, prev - rowIds.length) : undefined);
          fetchUndoRedoStatus();
          toast.success('删除成功');
      } catch(err: any) { 
          console.error('批量删除失败', err); 
          toast.error(err.message || '批量删除失败');
      }
  };

  const handleBatchCellChange = async (rowId: string, updates: Record<string, any>) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const currentRow = findRowInTree(rows, rowId);
      if (!currentRow) return;

      // Optimistic update
      setRows(prev => {
          const updateRecursive = (list: Row[]): Row[] => {
              return list.map(r => {
                  if (r.id === rowId) return { ...r, data: { ...r.data, ...updates } };
                  if (r.children) return { ...r, children: updateRecursive(r.children) };
                  return r;
              });
          };
          return updateRecursive(prev);
      });

      try {
          const updatedData = { ...currentRow.data, ...updates };
          const dataToSend = prepareDataForBackend(updatedData, activeTable.columns);

          const res = await api.updateRow(activeTableId, rowId, { 
              data: dataToSend,
              index: currentRow.index || 0,
              parent_id: currentRow.parent_id || null
          });

          // Update local state with the actual updated row from backend
          setRows(prev => {
              const updateRecursive = (list: Row[]): Row[] => {
                  return list.map(r => {
                      if (r.id === rowId) {
                          const finalData = { ...res.data.data };
                          for (const [colId, value] of Object.entries(updates)) {
                              const column = activeTable.columns.find(c => c.id === colId);
                              if (column && (column.type === FieldType.USER || column.type === FieldType.DEPARTMENT || column.type === FieldType.LINK || column.type === FieldType.ATTACHMENT)) {
                                  finalData[colId] = value;
                              }
                          }
                          return { ...r, ...res.data, data: finalData, children: r.children };
                      }
                      if (r.children) return { ...r, children: updateRecursive(r.children) };
                      return r;
                  });
              };
              return updateRecursive(prev);
          });

          if (activeTable.columns.some(c => c.type === FieldType.FORMULA)) {
              await fetchRows(1, true);
          }

          fetchUndoRedoStatus();

          // Check for dependent Search Reference columns
          let shouldFetchSearchRef = false;
          for (const colId of Object.keys(updates)) {
              const dependentCols = activeTable.columns.filter(c => 
                  c.type === FieldType.SEARCH_REFERENCE && 
                  c.config.search_reference_config?.filters?.some(f => f.current_field_id === colId)
              );
              if (dependentCols.length > 0) {
                  await api.batchUpdateSearchReference(activeTableId, colId);
                  shouldFetchSearchRef = true;
              }
          }
          if (shouldFetchSearchRef) {
              await fetchRows(1, true);
          }
      } catch(err: any) { 
          console.error('修改单元格(批量)失败', err);
          toast.error(err.message || '修改单元格失败');
          fetchRows(1, true);
      }
  };

  const handleCellChange = async (rowId: string, colId: string, value: any) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const currentRow = findRowInTree(rows, rowId);
      if (!currentRow) return;

      const column = activeTable.columns.find(c => c.id === colId);

      // Optimistic update
      setRows(prev => {
          const updateRecursive = (list: Row[]): Row[] => {
              return list.map(r => {
                  if (r.id === rowId) return { ...r, data: { ...r.data, [colId]: value } };
                  if (r.children) return { ...r, children: updateRecursive(r.children) };
                  return r;
              });
          };
          return updateRecursive(prev);
      });

      try {
          const updatedData = { ...currentRow.data, [colId]: value };
          const dataToSend = prepareDataForBackend(updatedData, activeTable.columns);

          const res = await api.updateRow(activeTableId, rowId, { 
              data: dataToSend,
              index: currentRow.index || 0,
              parent_id: currentRow.parent_id || null
          });

          // Update local state with the actual updated row from backend
          setRows(prev => {
              const updateRecursive = (list: Row[]): Row[] => {
                  return list.map(r => {
                      if (r.id === rowId) {
                          // Merge rich data from optimistic update if it's a USER/DEPARTMENT field
                          const finalData = { ...res.data.data };
                          if (column && (column.type === FieldType.USER || column.type === FieldType.DEPARTMENT || column.type === FieldType.LINK || column.type === FieldType.ATTACHMENT)) {
                              finalData[colId] = value;
                          }
                          return { ...r, ...res.data, data: finalData, children: r.children };
                      }
                      if (r.children) return { ...r, children: updateRecursive(r.children) };
                      return r;
                  });
              };
              return updateRecursive(prev);
          });

          // If there are formula columns, refresh data to ensure all formulas are updated
          if (activeTable.columns.some(c => c.type === FieldType.FORMULA)) {
              await fetchRows(1, true);
          }

          // After update, if it's a USER field, we don't necessarily need to update the state with the full object
          // because we want to keep the state as IDs. The display component will handle fetching.
          // However, we can still fetch to verify or just let the display component do its job.
          // For now, I'll remove the state update with the full object to keep it as IDs.
          if (column && column.type === FieldType.USER) {
              // We don't update rows state with the rich object here anymore
              // to ensure we always store IDs.
          }

          fetchUndoRedoStatus();

          // Check for dependent Search Reference columns and trigger update
          if (activeTable) {
             const dependentCols = activeTable.columns.filter(c => 
                 c.type === FieldType.SEARCH_REFERENCE && 
                 c.config.search_reference_config?.filters?.some(f => f.current_field_id === colId)
             );
             
             if (dependentCols.length > 0) {

                 await api.batchUpdateSearchReference(activeTableId, colId);
                 await fetchRows(1, true);
             }
          }
      } catch(err: any) { 
          console.error('修改单元格失败', err);
          toast.error(err.message || '修改单元格失败');
          fetchRows(1, true);
      }
  };

  // ... Options Handlers ...
  const handleOptionChange = async (colId: string, oldOpt: string, newOpt: string | null) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const column = activeTable.columns.find(c => c.id === colId);
      if (!column) return;

      let newOptions = column.config.options || [];
      let newOptionColors = { ...column.config.option_colors };

      if (newOpt === null) {
          newOptions = newOptions.filter(o => o !== oldOpt);
          delete newOptionColors[oldOpt];
      } else if (oldOpt === 'new') {
          if (!newOptions.includes(newOpt)) newOptions.push(newOpt);
      } else {
          newOptions = newOptions.map(o => o === oldOpt ? newOpt : o);
          if (newOptionColors[oldOpt]) {
              newOptionColors[newOpt] = newOptionColors[oldOpt];
              delete newOptionColors[oldOpt];
          }
      }

      const updatedCol = {
          ...column,
          config: { ...column.config, options: newOptions, option_colors: newOptionColors }
      };

      try {
          await api.updateColumn(activeTableId, colId, updatedCol);
          fetchTableDetail(activeTableId);
      } catch (err: any) { 
          console.error('更新选项失败', err); 
          toast.error(err.message || '更新选项失败');
      }
  };

  const visibleColumns = useMemo(() => {
      if (!activeTable) return [];
      const widths = activeView?.config?.columnWidths || {};
      const visibleIds = activeView?.config?.visibleColumns;
      
      let cols = activeTable.columns;
      if (visibleIds) {
          cols = cols.filter(c => visibleIds.includes(c.id));
      }
      
      return cols.map(c => ({
          ...c,
          width: widths[c.id] || c.width || 150
      })).sort((a,b) => (a.sort || 0) - (b.sort || 0));
  }, [activeTable, activeView]);

  const handleColumnUpdate = async (updatedCol: Column) => {
      if(activeTableId && activeTable && activeTable.id === activeTableId) {
          try {
              await api.updateColumn(activeTableId, updatedCol.id, updatedCol);
              fetchTableDetail(activeTableId);
          } catch (err: any) {
              console.error('更新列失败', err);
              toast.error(err.message || '更新列失败');
          }
      }
  };

  // --- Comments ---
  const handleOpenComment = async (rowId: string, colId: string) => {
      if (!activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      setCommentDialogState({ isOpen: true, rowId, colId });
      if (activeTableId) {
          try {
              const res = await api.getComments(activeTableId, { row_id: rowId, column_id: colId });
              setCurrentComments(res.data.list);
          } catch(err) { console.error(err); }
      }
  };

  const handleAddComment = async (text: string) => {
      if (!commentDialogState || !activeTableId || !activeTable || activeTable.id !== activeTableId) return;
      const { rowId, colId } = commentDialogState;
      try {
          const res: any = await api.addComment(activeTableId, { row_id: rowId, column_id: colId, content: text });
          const newComment = res.data; // API now returns the formatted Comment object
          
          setCurrentComments(prev => [...prev, newComment]);

          // Refresh comment counts for the grid view
          fetchAllComments();
      } catch(err: any) { 
          console.error('添加评论失败', err); 
          toast.error(err.message || '添加评论失败');
      }
  };
  
  const handleDeleteComment = async (commentId: string) => {
      if (!activeTableId || !commentDialogState || !activeTable || activeTable.id !== activeTableId) return;
      const { rowId, colId } = commentDialogState;
      try {
          const res: any = await api.deleteComment(activeTableId, commentId);
          setCurrentComments(prev => prev.filter(c => c.id !== commentId));

          // Refresh comment counts for the grid view
          fetchAllComments();
      } catch(err: any) { 
          console.error('删除评论失败', err); 
          toast.error(err.message || '删除评论失败');
      }
  };

  // ... Render Toolbar ...
  const handleFiltersChange = (filters: FilterCondition[]) => updateViewConfig({ filters });
  const handleSortsChange = (sorts: SortCondition[]) => updateViewConfig({ sorts });
  const handleGroupChange = (groups: GroupCondition[]) => updateViewConfig({ groups });
  const handleColorRulesChange = (colorRules: ColorRule[]) => updateViewConfig({ colorRules });
  const handleRowHeightChange = (rowHeight: RowHeight) => updateViewConfig({ rowHeight });
  
  const handleIndividualRowHeightChange = (rowId: string, height: number) => {
      if (!activeTableId || !activeViewId || !activeView || !activeTable || activeTable.id !== activeTableId) return;
      
      const currentHeights = activeView.config?.rowHeights || {};
      const newHeights = { ...currentHeights, [rowId]: height };
      const newConfig = { ...activeView.config, rowHeights: newHeights };

      // Optimistic update
      setActiveTable(prev => {
          if (!prev) return null;
          return {
              ...prev,
              views: prev.views.map(v => v.id === activeViewId ? { ...v, config: newConfig } : v)
          };
      });

      debouncedUpdateViewConfig(activeTableId, activeViewId, newConfig);
  };
  const handleCalendarSettingChange = (key: string, value: any) => updateViewConfig({ [key]: value });
  const handleCalendarTitleChange = (titleField: string) => updateViewConfig({ titleField });
  const handleCalendarColorConfig = (colorFieldId?: string | null, customColor?: string) => updateViewConfig({ colorFieldId, customColor });
  const handleGanttSettingChange = (updates: Record<string, any>) => updateViewConfig(updates);
  const handleGallerySettingChange = (key: string, value: any) => updateViewConfig({ [key]: value });

  const handleExportTable = async () => {
      if (!activeTableId) return;
      try {
          const blob = await api.exportTable(activeTableId);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${activeTable?.name || 'export'}.xlsx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
      } catch (err) {
          console.error('导出失败', err);
          // If it's a 401, the api.ts already dispatches 'api:unauthorized' which opens the token dialog
      }
  };

  const renderToolbar = () => {
      if (!activeView || !activeTable) return null;
      const closeMenus = () => setOpenMenu(null);

      const addRecordButton = (
        <>
            <button onClick={async () => {
                const newRow = await handleAddRow();
                if (newRow) {
                    setActiveDetailRowId(newRow.id);
                }
            }} className="flex items-center gap-1.5 px-3 py-1.5 text-primary-600 hover:text-primary-700 font-bold hover:bg-primary-50 rounded-md text-xs transition-colors"><ICONS.Plus /> 添加记录</button>
            <div className="h-4 w-[1px] bg-gray-200"></div>
        </>
      );
      
      const ToolbarButton: React.FC<{ icon: React.ReactNode, label: string, onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void, isActive?: boolean }> = ({ icon, label, onClick, isActive }) => (
        <button onClick={(e) => { e.stopPropagation(); if (onClick) onClick(e); }} className={`px-2 py-1.5 text-[11px] font-semibold rounded flex items-center gap-1.5 transition-colors ${isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}>
          <span className="shrink-0">{icon}</span>
          {label}
        </button>
      );

      const filterButton = (
        <div className="relative">
            <ToolbarButton icon={<ICONS.Filter />} label="筛选" isActive={!!activeView.config?.filters?.length} onClick={() => setOpenMenu(openMenu === 'FILTER' ? null : 'FILTER')} />
            {openMenu === 'FILTER' && (
                <ClickOutsideWrapper onClickOutside={closeMenus}>
                    <FilterMenu columns={activeTable.columns} filters={activeView.config?.filters || []} onChange={handleFiltersChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />
                </ClickOutsideWrapper>
            )}
        </div>
      );

      if (activeView.type === ViewType.CALENDAR) {
          return <div className="flex items-center gap-2" id="tour-toolbar">{addRecordButton}<div className="relative"><ToolbarButton icon={<ICONS.Settings />} label="日程块配置" isActive={openMenu === 'CAL_APP'} onClick={() => setOpenMenu(openMenu === 'CAL_APP' ? null : 'CAL_APP')} />{openMenu === 'CAL_APP' && (
    <ClickOutsideWrapper onClickOutside={closeMenus}>
        <CalendarAppearanceMenu columns={activeTable.columns} visibleColumns={activeView.config?.visibleColumns} titleField={activeView.config?.titleField} colorFieldId={activeView.config?.colorFieldId} customColor={activeView.config?.customColor} onToggleVisibility={handleToggleColumnVisibility} onChangeTitleField={handleCalendarTitleChange} onChangeColorConfig={handleCalendarColorConfig} onClose={closeMenus} />
    </ClickOutsideWrapper>
)}</div><div className="relative"><ToolbarButton icon={<ICONS.Calendar />} label="日历配置" isActive={openMenu === 'CAL_SET'} onClick={() => setOpenMenu(openMenu === 'CAL_SET' ? null : 'CAL_SET')} />{openMenu === 'CAL_SET' && (
    <ClickOutsideWrapper onClickOutside={closeMenus}>
        <CalendarSettingMenu columns={activeTable.columns} config={{ dateField: activeView.config?.dateField, endDateField: activeView.config?.endDateField, defaultDuration: activeView.config?.defaultDuration }} onChange={handleCalendarSettingChange} onClose={closeMenus} />
    </ClickOutsideWrapper>
)}</div>{filterButton}</div>
      }
      if (activeView.type === ViewType.GANTT) {
          return <div className="flex items-center gap-2" id="tour-toolbar">{addRecordButton}
            <div className="relative">
                <ToolbarButton icon={<ICONS.Settings />} label="字段配置" isActive={openMenu === 'FIELD'} onClick={() => setOpenMenu(openMenu === 'FIELD' ? null : 'FIELD')} />
                {openMenu === 'FIELD' && (
                    <FieldMenu 
                        columns={activeTable.columns}
                        visibleColumnIds={activeView.config?.visibleColumns}
                        onClose={closeMenus}
                        onEditColumn={(col, pos) => { 
                            setEditingColumn(col); 
                            setFieldConfigAnchor(pos || null);
                            setIsFieldDialogOpen(true); 
                        }}
                        onAddColumn={(pos) => {
                            setEditingColumn(null);
                            setFieldConfigAnchor(pos || null);
                            setIsFieldDialogOpen(true);
                        }}
                        onToggleVisibility={handleToggleColumnVisibility}
                        onShowAll={() => updateViewConfig({ visibleColumns: activeTable.columns.map(c => c.id) })}
                        onHideAll={() => updateViewConfig({ visibleColumns: [activeTable.columns[0].id] })}
                        onDeleteColumn={handleDeleteColumn}
                        onDeleteColumns={handleDeleteColumns}
                        onSort={handleColumnSort}
                    />
                )}
            </div>
            <div className="relative"><ToolbarButton icon={<ICONS.Gantt />} label="甘特图配置" isActive={openMenu === 'GANTT_SET'} onClick={() => setOpenMenu(openMenu === 'GANTT_SET' ? null : 'GANTT_SET')} />{openMenu === 'GANTT_SET' && (
    <ClickOutsideWrapper onClickOutside={closeMenus}>
        <GanttSettingMenu columns={activeTable.columns} config={{ dateField: activeView.config?.dateField, endDateField: activeView.config?.endDateField, titleField: activeView.config?.titleField, colorFieldId: activeView.config?.colorFieldId, customColor: activeView.config?.customColor, isWorkdayOnly: activeView.config?.isWorkdayOnly }} onChange={handleGanttSettingChange} onClose={closeMenus} />
    </ClickOutsideWrapper>
)}</div>{filterButton}<div className="relative"><ToolbarButton icon={<ICONS.Group />} label={activeView.config?.groups?.length ? `分组: ${activeView.config.groups.length} 个条件` : '分组'} isActive={!!activeView.config?.groups?.length} onClick={() => setOpenMenu(openMenu === 'GROUP' ? null : 'GROUP')} />{openMenu === 'GROUP' && <GroupMenu columns={activeTable.columns} groups={activeView.config?.groups} onChange={handleGroupChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />}</div><div className="relative"><ToolbarButton icon={<ICONS.Sort />} label="排序" isActive={!!activeView.config?.sorts?.length} onClick={() => setOpenMenu(openMenu === 'SORT' ? null : 'SORT')} />{openMenu === 'SORT' && <SortMenu columns={activeTable.columns} sorts={activeView.config?.sorts || []} onChange={handleSortsChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />}</div></div>
      }
      if (activeView.type === ViewType.GALLERY) {
          return <div className="flex items-center gap-2" id="tour-toolbar">{addRecordButton}<div className="relative"><ToolbarButton icon={<ICONS.Settings />} label="卡片配置" isActive={openMenu === 'GALLERY_SET'} onClick={() => setOpenMenu(openMenu === 'GALLERY_SET' ? null : 'GALLERY_SET')} />{openMenu === 'GALLERY_SET' && (
    <ClickOutsideWrapper onClickOutside={closeMenus}>
        <GallerySettingMenu allColumns={activeTable.columns} visibleColumns={activeView.config?.visibleColumns} config={{ coverFieldId: activeView.config?.coverFieldId, galleryStyle: activeView.config?.galleryStyle, showFieldNames: activeView.config?.showFieldNames }} onChange={handleGallerySettingChange} onToggleVisibility={handleToggleColumnVisibility} onAddColumn={() => { setEditingColumn(null); setIsFieldDialogOpen(true); }} onClose={closeMenus} />
    </ClickOutsideWrapper>
)}</div>{filterButton}<div className="relative"><ToolbarButton icon={<ICONS.Sort />} label="排序" isActive={!!activeView.config?.sorts?.length} onClick={() => setOpenMenu(openMenu === 'SORT' ? null : 'SORT')} />{openMenu === 'SORT' && <SortMenu columns={activeTable.columns} sorts={activeView.config?.sorts || []} onChange={handleSortsChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />}</div></div>
      }
      
      return (
          <div className="flex items-center gap-2" id="tour-toolbar">
              {addRecordButton}
              <div className="relative">
                <ToolbarButton icon={<ICONS.Group />} label={activeView.type === ViewType.KANBAN ? (activeView.config?.groups?.[0]?.column_id ? `分组依据: ${activeTable.columns.find(c => c.id === activeView.config?.groups?.[0]?.column_id)?.name}` : '分组') : (activeView.config?.groups?.length ? `分组: ${activeView.config.groups.length} 个条件` : '分组')} isActive={!!activeView.config?.groups?.length} onClick={() => setOpenMenu(openMenu === 'GROUP' ? null : 'GROUP')} />
                {openMenu === 'GROUP' && (
                    <ClickOutsideWrapper onClickOutside={closeMenus}>
                        {activeView.type === ViewType.KANBAN ? (
                            <SimpleGroupMenu columns={activeTable.columns} groups={activeView.config?.groups} onChange={handleGroupChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />
                        ) : (
                            <GroupMenu columns={activeTable.columns} groups={activeView.config?.groups} onChange={handleGroupChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />
                        )}
                    </ClickOutsideWrapper>
                )}
              </div>
              <div className="relative">
                <ToolbarButton 
                    icon={<ICONS.Settings />} 
                    label={activeView.type === ViewType.KANBAN ? "卡片配置" : "字段配置"} 
                    isActive={openMenu === 'FIELD'} 
                    onClick={() => setOpenMenu(openMenu === 'FIELD' ? null : 'FIELD')} 
                />
                {openMenu === 'FIELD' && (
                    <ClickOutsideWrapper onClickOutside={closeMenus}>
                        <FieldMenu 
                            columns={activeTable.columns}
                            visibleColumnIds={activeView.config?.visibleColumns}
                            onClose={closeMenus}
                            onEditColumn={(col, pos) => { 
                                setEditingColumn(col); 
                                setFieldConfigAnchor(pos || null);
                                setIsFieldDialogOpen(true); 
                            }}
                            onAddColumn={(pos) => {
                                setEditingColumn(null);
                                setFieldConfigAnchor(pos || null);
                                setIsFieldDialogOpen(true);
                            }}
                            onToggleVisibility={handleToggleColumnVisibility}
                            onShowAll={() => updateViewConfig({ visibleColumns: activeTable.columns.map(c => c.id) })}
                            onHideAll={() => updateViewConfig({ visibleColumns: [activeTable.columns[0].id] })}
                            onDeleteColumn={handleDeleteColumn}
                            onDeleteColumns={handleDeleteColumns}
                            onSort={handleColumnSort}
                        />
                    </ClickOutsideWrapper>
                )}
              </div>
              {filterButton}
              <div className="relative">
                <ToolbarButton icon={<ICONS.Sort />} label="排序" isActive={!!activeView.config?.sorts?.length} onClick={() => setOpenMenu(openMenu === 'SORT' ? null : 'SORT')} />
                {openMenu === 'SORT' && (
                    <ClickOutsideWrapper onClickOutside={closeMenus}>
                        <SortMenu columns={activeTable.columns} sorts={activeView.config?.sorts || []} onChange={handleSortsChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />
                    </ClickOutsideWrapper>
                )}
              </div>
              {activeView.type === ViewType.GRID && (<div className="relative"><ToolbarButton icon={<ICONS.Height />} label="行高" onClick={() => setOpenMenu(openMenu === 'HEIGHT' ? null : 'HEIGHT')} />{openMenu === 'HEIGHT' && (
    <ClickOutsideWrapper onClickOutside={closeMenus}>
        <RowHeightMenu current={activeView.config?.rowHeight || 'MEDIUM'} onChange={handleRowHeightChange} onClose={closeMenus} />
    </ClickOutsideWrapper>
)}</div>)}
              {activeView.type !== ViewType.KANBAN && (<div className="relative"><ToolbarButton icon={<ICONS.Color />} label="填色" isActive={!!activeView.config?.colorRules?.length} onClick={() => setOpenMenu(openMenu === 'COLOR' ? null : 'COLOR')} />{openMenu === 'COLOR' && (
    <ClickOutsideWrapper onClickOutside={closeMenus}>
        <ColorMenu columns={activeTable.columns} rules={activeView.config?.colorRules || []} onChange={handleColorRulesChange} onClose={closeMenus} onSaveAsView={handleSaveAsNewView} />
    </ClickOutsideWrapper>
)}</div>)}
          </div>
      )
  };

  const flattenedRowsForViews = useMemo(() => flattenTree(rows), [rows]);

  // --- Main Render ---
  if (isInitializing) {
      return null;
  }

  if (tables.length === 0 && !loading && !activeTable) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
            {isTokenDialogOpen ? <TokenConfigDialog onClose={() => setIsTokenDialogOpen(false)} /> : (
                <div className="text-center">
                    <p className="mb-4 text-gray-500">连接到服务端以获取数据</p>
                    <div className="flex items-center justify-center gap-4">
                        <button onClick={handleAddTable} className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">创建示例表</button>
                        <button onClick={() => setIsTokenDialogOpen(true)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-2">
                            <ICONS.Settings className="w-4 h-4" /> 配置Token
                        </button>
                    </div>
                </div>
            )}
        </div>
      );
  }

  return (
    <>
    <div className="mdtable-scrollbar flex h-screen w-full overflow-hidden text-sm bg-white">
      <Toaster position="top-right" richColors />
      {isSidebarOpen && (
        <>
          <Sidebar 
            tables={tables}
            activeTableId={activeTableId || ''}
            onTableSelect={setActiveTableId}
            onAddTable={handleAddTable}
            onImport={() => setIsImportDialogOpen(true)}
            onTemplate={(typeId) => {
              setSelectedTemplateTypeId(typeId);
              setIsTemplateDialogOpen(true);
            }}
            onRenameTable={handleRenameTable}
            onDeleteTable={handleDeleteTable}
            onDuplicateTable={handleDuplicateTable}
            onSearch={handleSearch}
            onToggleSidebar={() => setIsSidebarOpen(false)}
            width={sidebarWidth}
          />
          <div 
            className="w-1 hover:w-1.5 bg-transparent hover:bg-primary-400 cursor-col-resize z-50 shrink-0"
            onMouseDown={startResizing}
          />
        </>
      )}

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
         {activeTable && (
             <div className="flex items-center border-b border-gray-200 bg-gray-50 h-10 shrink-0 overflow-x-auto no-scrollbar px-2 gap-1">
                 {!isSidebarOpen && (
                     <>
                         <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-1 bg-white border border-gray-200 rounded shadow-sm hover:bg-gray-50 text-gray-500 flex items-center justify-center shrink-0 mr-2"
                            title={isSidebarOpen ? "收起菜单" : "展开菜单"}
                         >
                            {isSidebarOpen ? <ICONS.ChevronsLeft className="w-3 h-3" /> : <ICONS.ChevronsRight className="w-3 h-3" />}
                         </button>
                         <span className="text-sm font-bold text-gray-700 truncate mr-2">{activeTable.name}</span>
                     </>
                 )}
                 {activeTable.views?.map(view => (
                     <div 
                         key={view.id} 
                         className={`relative shrink-0 ${draggedViewId === view.id ? 'opacity-50' : ''}`}
                         draggable
                         onDragStart={(e) => handleViewDragStart(e, view.id)}
                         onDragOver={(e) => handleViewDragOver(e, view.id)}
                         onDragLeave={handleViewDragLeave}
                         onDrop={(e) => handleViewDrop(e, view.id)}
                         onDragEnd={handleViewDragEnd}
                     >
                         {dragOverViewId === view.id && (
                             <div className="absolute top-0 left-0 bottom-0 w-0.5 bg-primary-500 z-20 pointer-events-none" />
                         )}
                         {editingViewId === view.id ? (
                             <div className="px-3 py-1 flex items-center gap-2 bg-white border border-primary-400 rounded-t-md h-full">
                                 <span className="text-primary-600 scale-75">{getViewIcon(view.type)}</span>
                                 <input 
                                     ref={viewInputRef}
                                     value={editingViewName}
                                     onChange={(e) => setEditingViewName(e.target.value)}
                                     onBlur={handleViewRenameSubmit}
                                     onKeyDown={handleViewKeyDown}
                                     className="text-xs bg-transparent outline-none text-gray-900 w-24"
                                 />
                             </div>
                         ) : (
                             <button
                                 onClick={() => setActiveViewId(view.id)}
                                 onContextMenu={(e) => handleViewContextMenu(e, view.id)}
                                 className={`px-4 py-2 flex items-center gap-2 text-xs transition-all relative rounded-t-md border-t border-x ${
                                     activeViewId === view.id 
                                     ? 'bg-white border-gray-200 text-primary-600 font-bold -mb-[1px] z-10' 
                                     : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-100'
                                 }`}
                             >
                                 <span className={activeViewId === view.id ? 'text-primary-600' : 'text-gray-400'}>
                                     {getViewIcon(view.type)}
                                 </span>
                                 <span className="truncate max-w-[120px]">{view.name}</span>
                                 
                                 {activeViewId === view.id && (
                                     <div 
                                         onClick={(e) => { e.stopPropagation(); handleViewContextMenu(e, view.id); }}
                                         className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                                     >
                                         <ICONS.ChevronDown className="w-3 h-3" />
                                     </div>
                                 )}
                             </button>
                         )}
                     </div>
                 ))}
                 <button 
                    onClick={handleAddView}
                    className="p-2 hover:bg-gray-200 rounded-md text-gray-400 hover:text-primary-600 transition-colors shrink-0" 
                    title="添加视图"
                 >
                    <ICONS.Plus className="w-4 h-4" />
                 </button>
             </div>
         )}

         {/* Top Header */}
         <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 bg-white shrink-0 relative z-50">
             <div className="flex items-center gap-4">
                <div className="font-bold text-gray-800 text-lg truncate max-w-[200px]">{activeView?.name || 'Loading...'}</div>
                <div className="h-4 w-[1px] bg-gray-300"></div>
                <div className="flex items-center gap-1">
                    {renderToolbar()}
                </div>
             </div>
             
             <div className="flex items-center gap-2">
                 {activeView && (
                     <button 
                        onClick={() => setIsSearchOpen(!isSearchOpen)}
                        className={`p-1.5 rounded transition-colors ${isSearchOpen ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-100 hover:text-primary-600'}`}
                        title="查找"
                     >
                         <ICONS.Search className="w-4 h-4" />
                     </button>
                 )}
                 {activeView?.type === ViewType.GRID && (
                     <button 
                        onClick={handleExportTable}
                        className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors font-medium text-xs mr-2"
                        title="导出表格"
                     >
                        <ICONS.Download className="w-4 h-4" /> 导出表格
                     </button>
                 )}
                 <div className="flex items-center gap-1 mr-2">
                     <button onClick={handleUndo} disabled={!canUndo} className={`p-1.5 rounded transition-colors ${canUndo ? 'text-gray-600 hover:bg-gray-100 hover:text-primary-600' : 'text-gray-300 cursor-not-allowed'}`} title="撤回">
                         <ICONS.Undo className="w-4 h-4" />
                     </button>
                     <button onClick={handleRedo} disabled={!canRedo} className={`p-1.5 rounded transition-colors ${canRedo ? 'text-gray-600 hover:bg-gray-100 hover:text-primary-600' : 'text-gray-300 cursor-not-allowed'}`} title="恢复">
                         <ICONS.Redo className="w-4 h-4" />
                     </button>
                 </div>
                 { <button 
                    onClick={() => setIsTokenDialogOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors font-medium text-xs mr-2"
                 >
                    <ICONS.Settings className="w-4 h-4" /> 配置Token
                 </button> }
                 <button 
                    onClick={() => setIsCollaboratorDialogOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors font-medium text-xs"
                 >
                    <ICONS.Users className="w-4 h-4" /> 权限管理
                 </button>

                 <div className="h-4 w-[1px] bg-gray-300 mx-1"></div>
                 <button 
                    onClick={() => setIsTourOpen(true)}
                    className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors group relative"
                    title="新手引导"
                 >
                    <ICONS.Help className="w-4 h-4" />
                    {/* Tooltip */}
                    <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[100]">
                        新手引导
                    </div>
                 </button>
             </div>
         </div>

         {/* Main View Area */}
         <div className="flex-1 overflow-hidden relative" id="tour-main-content">
            {loading && <div className="absolute inset-0 bg-white/50 z-50 flex items-center justify-center">Loading...</div>}
            
            {activeTable && activeView && activeView.type === ViewType.GRID && (
                <GridView 
                    key={activeView.id}
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    allTables={tables} 
                    rows={rows}
                    totalCount={totalRowsCount}
                    groups={activeView.config?.groups}
                    rowHeight={activeView.config?.rowHeight}
                    rowHeights={activeView.config?.rowHeights}
                    colorRules={activeView.config?.colorRules}
                    onCellChange={handleCellChange}
                    onAddColumn={handleAddColumn}
                    onEditColumn={(col, pos) => { 
                        setEditingColumn(col); 
                        setFieldConfigAnchor(pos || null);
                        setIsFieldDialogOpen(true); 
                    }}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onBatchProcessRows={handleBatchProcessRows}
                    onAddSubRow={handleAddSubRow}
                    onInsertRow={handleInsertRow}
                    onDuplicateRow={handleDuplicateRow}
                    onDeleteRow={handleDeleteRow}
                    onDeleteRows={handleDeleteRows}
                    onOpenComment={handleOpenComment}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    onColumnResize={handleColumnResize}
                    onRowHeightChange={handleIndividualRowHeightChange}
                    onColumnUpdate={handleColumnUpdate}
                    onOptionChange={handleOptionChange}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    onRefresh={fetchRows}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                    onSort={handleColumnSort}
                />
            )}
            
            {activeTable && activeView && activeView.type === ViewType.KANBAN && (
                <KanbanView 
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={flattenedRowsForViews}
                    groupByFieldId={activeView.config?.groups?.[0]?.column_id || activeView.config?.groupBy || visibleColumns[1]?.id || visibleColumns[0].id} 
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onAddGroup={(colId, opt) => handleOptionChange(colId, 'new', opt)}
                    onOptionChange={handleOptionChange}
                    onCellChange={handleCellChange}
                    onInsertRow={handleInsertRow}
                    onDuplicateRow={handleDuplicateRow}
                    onDeleteRows={handleDeleteRows}
                    onOpenComment={handleOpenComment}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                />
            )}

            {activeTable && activeView && activeView.type === ViewType.CALENDAR && (
                <CalendarView 
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={flattenedRowsForViews}
                    dateFieldId={activeView.config?.dateField}
                    endDateFieldId={activeView.config?.endDateField}
                    titleFieldId={activeView.config?.titleField}
                    colorFieldId={activeView.config?.colorFieldId}
                    customColor={activeView.config?.customColor}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onCellChange={handleCellChange}
                    onDeleteRows={handleDeleteRows}
                    onOpenComment={handleOpenComment}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                />
            )}

            {activeTable && activeView && activeView.type === ViewType.GALLERY && (
                <GalleryView 
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={flattenedRowsForViews}
                    coverFieldId={activeView.config?.coverFieldId}
                    displayMode={activeView.config?.galleryStyle}
                    showFieldNames={activeView.config?.showFieldNames}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onCellChange={handleCellChange}
                    onInsertRow={handleInsertRow}
                    onDuplicateRow={handleDuplicateRow}
                    onDeleteRow={handleDeleteRow}
                    onOpenComment={handleOpenComment}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                />
            )}

            {activeTable && activeView && activeView.type === ViewType.GANTT && (
                <GanttView 
                    tableId={activeTable.id}
                    columns={visibleColumns}
                    allColumns={activeTable.columns}
                    rows={rows}
                    dateFieldId={activeView.config?.dateField}
                    endDateFieldId={activeView.config?.endDateField}
                    titleFieldId={activeView.config?.titleField}
                    colorFieldId={activeView.config?.colorFieldId}
                    customColor={activeView.config?.customColor}
                    isWorkdayOnly={activeView.config?.isWorkdayOnly}
                    viewMode={activeView.config?.ganttViewMode || 'month'}
                    onViewModeChange={(mode) => updateViewConfig({ ganttViewMode: mode })}
                    onAddRow={handleAddRow}
                    onDirectAddRow={handleDirectAddRow}
                    onInsertRow={handleInsertRow}
                    onDeleteRows={handleDeleteRows}
                    onOpenComment={handleOpenComment}
                    onColumnResize={handleColumnResize}
                    onCellChange={handleCellChange}
                    onBatchCellChange={handleBatchCellChange}
                    onColumnUpdate={handleColumnUpdate}
                    onOpenDetail={(row) => setActiveDetailRowId(row.id)}
                    commentCounts={commentCounts}
                    searchKeyword={rowSearchKeyword}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    onLoadMore={() => fetchRows(page + 1)}
                />
            )}

            {activeTable && activeView && activeView.type === ViewType.DASHBOARD && (
                <DashboardView 
                    columns={activeTable.columns}
                    rows={rows}
                />
            )}
         </div>
      </div>

      {/* Dialogs */}
      {isFieldDialogOpen && (
          <FieldConfigDialog 
             tableId={activeTableId || ''}
             column={editingColumn || undefined}
             allColumns={activeTable?.columns}
             allTables={tables}
             isVisible={editingColumn ? (activeView?.config?.visibleColumns ? activeView.config.visibleColumns.includes(editingColumn.id) : true) : true}
             anchorEl={fieldConfigAnchor}
             mode={fieldConfigAnchor ? 'popover' : 'modal'}
             onClose={() => { setIsFieldDialogOpen(false); setFieldConfigAnchor(null); }}
             onSave={handleSaveColumn}
             onDelete={handleDeleteColumn}
          />
      )}
      
      {isViewDialogOpen && (
          <ViewConfigDialog 
             onClose={() => setIsViewDialogOpen(false)}
             onSave={handleCreateView}
          />
      )}

      {isTemplateDialogOpen && (
          <TemplateDialog 
             initialTypeId={selectedTemplateTypeId}
             onClose={() => {
               setIsTemplateDialogOpen(false);
               setSelectedTemplateTypeId(undefined);
             }}
             onSelect={handleTemplateSelect}
          />
      )}

      {isImportDialogOpen && (
          <ImportDialog 
             onClose={() => setIsImportDialogOpen(false)}
             onImport={handleImportTable}
          />
      )}

      {commentDialogState && commentDialogState.isOpen && activeTable && (
          <CommentDialog 
              comments={currentComments}
              rowName={rows.find(r => r.id === commentDialogState.rowId)?.data[activeTable.columns[0].id] || '记录'}
              columnName={activeTable.columns.find(c => c.id === commentDialogState.colId)?.name || '字段'}
              onClose={() => { setCommentDialogState(null); setCurrentComments([]); }}
              onAdd={handleAddComment}
              onDelete={handleDeleteComment}
          />
      )}

      {isTokenDialogOpen && (
          <TokenConfigDialog onClose={() => setIsTokenDialogOpen(false)} />
      )}

      {isCollaboratorDialogOpen && activeTableId && (
          <CollaboratorDialog 
              tableId={activeTableId} 
              onClose={() => setIsCollaboratorDialogOpen(false)} 
          />
      )}



      {confirmDialog && (
        <ConfirmDialog 
          isOpen={confirmDialog.isOpen} 
          title={confirmDialog.title} 
          message={confirmDialog.message} 
          onConfirm={confirmDialog.onConfirm} 
          onCancel={() => setConfirmDialog(null)} 
        />
      )}

      <OnboardingTour 
        steps={tourSteps}
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
      />

      {/* View Context Menu */}
      {viewContextMenu && (
          <div 
             className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[100] min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
             style={{ top: viewContextMenu.y, left: viewContextMenu.x }}
             onMouseDown={(e) => e.stopPropagation()} 
          >
             <button 
                onClick={() => handleViewRenameStart(viewContextMenu.viewId, activeTable?.views?.find(v => v.id === viewContextMenu.viewId)?.name || '')}
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2 text-gray-700"
             >
                <ICONS.Edit /> 重命名视图
             </button>
             <div className="h-[1px] bg-gray-100 my-1"></div>
             <button 
                onClick={() => { handleDeleteView(viewContextMenu.viewId); setViewContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 hover:text-red-600 flex items-center gap-2 text-red-500"
             >
                <ICONS.Trash /> 删除视图
             </button>
          </div>
      )}

      {/* Menus Overlay Click Handler */}
      {(openMenu || viewContextMenu) && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => { setOpenMenu(null); setViewContextMenu(null); }} />}

      {activeDetailRowId && activeTable && (() => {
          const row = findRowInTree(rows, activeDetailRowId);
          if (!row) return null;
          const flatIndex = flattenRows(rows).findIndex(r => r.id === activeDetailRowId);
          const flatRowsArray = flattenRows(rows);
          const canPrev = flatIndex > 0;
          const canNext = flatIndex !== -1 && flatIndex < flatRowsArray.length - 1;

          return (
              <RowDetailPanel 
                  tableId={activeTable.id}
                  row={row}
                  columns={activeTable.columns}
                  onClose={() => setActiveDetailRowId(null)}
                  onChange={(rowId, colId, val) => handleCellChange(rowId, colId, val)}
                  onAddColumn={handleAddColumn}
                  canPrev={canPrev}
                  canNext={canNext}
                  onPrev={() => canPrev && setActiveDetailRowId(flatRowsArray[flatIndex - 1].id)}
                  onNext={() => canNext && setActiveDetailRowId(flatRowsArray[flatIndex + 1].id)}
              />
          );
      })()}

      {isCreatingNewRow && activeTable && (
          <RowDetailPanel 
              tableId={activeTable.id}
              row={{ id: 'new', data: newRowData } as any}
              columns={activeTable.columns}
              onClose={() => {
                  setIsCreatingNewRow(false);
                  setNewRowData({});
              }}
              onChange={(rowId, colId, val) => {
                  setNewRowData(prev => ({ ...prev, [colId]: val }));
              }}
              onConfirm={() => handleConfirmAddRow(newRowData)}
              isNew={true}
          />
      )}

      {/* Search Panel */}
            {isSearchOpen && activeView && (
                <motion.div
                    drag
                    dragControls={dragControls}
                    dragListener={false}
                    className="absolute top-4 right-4 z-[9999]"
                >
                    <div className="bg-white shadow-xl border border-gray-200 rounded-lg p-1.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="cursor-move p-1" onPointerDown={(e) => dragControls.start(e)}>
                            <ICONS.Search className="w-4 h-4 text-gray-400" />
                        </div>
                        <input 
                            className="w-40 text-sm outline-none text-gray-700 placeholder-gray-400"
                            placeholder="查找..."
                            autoFocus
                            defaultValue={rowSearchKeyword}
                            onChange={(e) => handleRowSearch(e.target.value)}
                        />
                        <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>
                        <span className="text-xs text-gray-400 whitespace-nowrap px-1">
                            {rowSearchKeyword ? `共 ${rows.length} 条` : '请输入关键字'}
                        </span>
                        <button 
                            onClick={() => {
                                setIsSearchOpen(false);
                                setRowSearchKeyword('');
                                handleRowSearch('');
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors ml-1"
                        >
                            <ICONS.Close className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </motion.div>
            )}
    </div>
    <style jsx global>{`
      .mdtable-scrollbar ::-webkit-scrollbar:horizontal {
        height: 10px !important;
      }
      .mdtable-scrollbar ::-webkit-scrollbar {
        height: 10px !important;
      }
    `}</style>
    </>
  );
};

export default App;
