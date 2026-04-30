
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Table, ViewMetadata, ViewType } from '../types';
import { ICONS } from '../constants';
import { Tooltip } from './Tooltip';

interface SidebarProps {
  tables: Table[];
  activeTableId: string;
  onTableSelect: (id: string) => void;
  onAddTable: () => void;
  onImport: () => void;
  onTemplate: () => void;
  onRenameTable: (id: string, newName: string) => void;
  onDeleteTable: (id: string) => void;
  onDuplicateTable: (id: string) => void; // New Prop
  onSearch: (keyword: string) => void;
  onToggleSidebar: () => void;
  width?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    tables, 
    activeTableId, 
    onTableSelect, 
    onAddTable,
    onImport,
    onTemplate,
    onRenameTable,
    onDeleteTable,
    onDuplicateTable,
    onSearch,
    onToggleSidebar,
    width = 256
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  
  // Table Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tableId: string } | null>(null);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  const activeTable = tables.find(t => t.id === activeTableId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsAddMenuOpen(false);
      }
      
      if (contextMenuRef.current && contextMenuRef.current.contains(event.target as Node)) {
        return;
      }
      
      setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus input when editing starts (Table)
  useEffect(() => {
      if (editingTableId && inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
      }
  }, [editingTableId]);

  // --- Table Handlers ---
  const handleContextMenu = (e: React.MouseEvent, tableId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const menuWidth = 160;
      const menuHeight = 150;
      const offsetBuffer = 20; // Add a small buffer to ensure it doesn't clip
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (window.innerWidth - x < menuWidth + offsetBuffer) {
          x = window.innerWidth - menuWidth - offsetBuffer;
      }
      
      if (window.innerHeight - y < menuHeight + offsetBuffer) {
          y = window.innerHeight - menuHeight - offsetBuffer;
      }
      
      setContextMenu({ x: Math.max(0, x), y: Math.max(0, y), tableId });
  };

  const handleRenameStart = (tableId: string, currentName: string) => {
      setEditingTableId(tableId);
      setEditingName(currentName);
      setContextMenu(null);
  };

  const handleRenameSubmit = () => {
      if (editingTableId && editingName.trim()) {
          onRenameTable(editingTableId, editingName.trim());
      }
      setEditingTableId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRenameSubmit();
      if (e.key === 'Escape') setEditingTableId(null);
  };

  const addMenuItems = [
    { label: '空白数据表', icon: <ICONS.Grid />, action: onAddTable },
    { label: '从模版创建', icon: <ICONS.Template />, action: onTemplate },
    { label: '多元数据导入', icon: <ICONS.Import />, action: onImport },
  ];

  return (
    <aside 
      className="border-r border-gray-200 h-screen bg-gray-50 flex flex-col shrink-0 select-none"
      style={{ width: `${width}px` }}
    >
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary-600 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis mr-2" title="OmniBase 多维数据管理平台">多维数据</h1>
        <div className="flex items-center ml-auto">
          <Tooltip content="收起菜单">
            <button 
                onClick={onToggleSidebar}
                className="p-1 bg-white border border-gray-200 rounded shadow-sm hover:bg-gray-50 text-gray-500 flex items-center justify-center shrink-0"
             >
                <ICONS.ChevronsLeft className="w-3 h-3" />
             </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        {/* 数据表部分 */}
        <section className="relative" ref={menuRef} id="tour-sidebar-workspaces">
          <div className="px-4 mb-2 flex justify-between items-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>工作区</span>
            <Tooltip content="新建" className="w-auto">
              <button 
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                className={`p-1 rounded hover:bg-gray-200 transition-colors ${isAddMenuOpen ? 'bg-gray-200 text-primary-600' : 'text-gray-400'}`}
              >
                <ICONS.Plus />
              </button>
            </Tooltip>
          </div>

          <div className="px-4 mb-2">
            <div className="relative">
              <ICONS.Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input 
                type="text"
                placeholder="搜索表格..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  onSearch(e.target.value);
                }}
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border border-gray-200 rounded text-gray-600 placeholder-gray-400 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 transition-all"
              />
            </div>
          </div>

          {/* 新增功能浮层 */}
          {isAddMenuOpen && (
            <div className="absolute left-4 top-8 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-left">
              {addMenuItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    item.action();
                    setIsAddMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600 flex items-center gap-3 transition-colors"
                >
                  <span className="text-gray-400 group-hover:text-primary-500 scale-90">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {tables.map(table => (
              <div key={table.id} className="relative group">
                  {editingTableId === table.id ? (
                      <div className="px-4 py-2 flex items-center gap-2">
                          <div className="w-5 h-5 bg-primary-100 text-primary-600 rounded flex items-center justify-center font-bold text-xs shrink-0">
                             {table.name[0]}
                          </div>
                          <input 
                              ref={inputRef}
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={handleRenameSubmit}
                              onKeyDown={handleKeyDown}
                              className="w-full text-sm bg-white border border-primary-400 rounded px-1.5 py-0.5 outline-none text-gray-900"
                          />
                      </div>
                  ) : (
                    <button
                        onClick={() => onTableSelect(table.id)}
                        onContextMenu={(e) => handleContextMenu(e, table.id)}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors relative pr-8 ${
                        activeTableId === table.id ? 'bg-primary-50 text-primary-700 border-r-4 border-primary-600' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <div className="w-5 h-5 bg-primary-100 text-primary-600 rounded flex items-center justify-center font-bold text-xs shrink-0">
                        {table.name[0]}
                        </div>
                        <Tooltip content={table.name} className="flex-1 min-w-0">
                          <span className="truncate block">{table.name}</span>
                        </Tooltip>
                        
                        {/* More Icon on Hover */}
                        <div 
                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, table.id); }}
                            className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-400 transition-all"
                        >
                            <ICONS.MoreHorizontal />
                        </div>
                    </button>
                  )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Table Context Menu */}
      {contextMenu && createPortal(
          <div 
             ref={contextMenuRef}
             className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-[9999] min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
             style={{ top: contextMenu.y, left: contextMenu.x }}
             onMouseDown={(e) => e.stopPropagation()} 
          >
             <button 
                onClick={() => {
                   const table = tables.find(t => t.id === contextMenu.tableId);
                   if (table && table.role === 'READ') {
                       toast.error("您没有权限重命名此项目");
                       return;
                   }
                   handleRenameStart(contextMenu.tableId, table?.name || '');
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                    tables.find(t => t.id === contextMenu.tableId)?.role === 'READ'
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'hover:bg-primary-50 hover:text-primary-600 text-gray-700'
                }`}
             >
                <ICONS.Edit /> 重命名
             </button>
             <button 
                onClick={() => { onDuplicateTable(contextMenu.tableId); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2 text-gray-700"
             >
                <ICONS.Copy /> 复制项目
             </button>
             <div className="h-[1px] bg-gray-100 my-1"></div>
             <button 
                onClick={() => { 
                   const table = tables.find(t => t.id === contextMenu.tableId);
                   if (table && table.role !== 'MANAGE') {
                       toast.error("您没有权限删除此项目");
                       return;
                   }
                   onDeleteTable(contextMenu.tableId); 
                   setContextMenu(null); 
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                    tables.find(t => t.id === contextMenu.tableId)?.role !== 'MANAGE'
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'hover:bg-red-50 hover:text-red-600 text-red-500'
                }`}
             >
                <ICONS.Trash /> 删除项目
             </button>
          </div>,
          document.body
      )}
    </aside>
  );
};

export default Sidebar;
