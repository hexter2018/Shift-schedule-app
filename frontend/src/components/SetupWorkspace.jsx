import ShiftCodeLegend from "./ShiftCodeLegend";
import HolidayPanel from "./HolidayPanel";
import GroupRotationPanel from "./GroupRotationPanel";
import GapFixPanel from "./GapFixPanel";

export default function SetupWorkspace({
  state, holidays, groupRotations, gapFixResult,
  onChangeCode, onRemoveCode, onAddCode, onChangeModifierColor,
  onAddHoliday, onRenameHoliday, onRemoveHoliday, onLoadDefaults, onApplyHolidays,
  onAddGroup, onRenameGroup, onUpdateGroup, onRemoveGroup, onToggleMember, onQuickAdd, onApplyRotation,
  onFixGaps, onAssignOtFromGap,
}){
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <ShiftCodeLegend state={state} onChangeCode={onChangeCode} onRemoveCode={onRemoveCode} onAddCode={onAddCode} onChangeModifierColor={onChangeModifierColor} />
        <HolidayPanel
          holidays={holidays}
          onAddHoliday={onAddHoliday} onRenameHoliday={onRenameHoliday} onRemoveHoliday={onRemoveHoliday}
          onLoadDefaults={onLoadDefaults} onApplyHolidays={onApplyHolidays}
        />
        <GroupRotationPanel
          state={state} groupRotations={groupRotations}
          onAddGroup={onAddGroup} onRenameGroup={onRenameGroup} onUpdateGroup={onUpdateGroup}
          onRemoveGroup={onRemoveGroup} onToggleMember={onToggleMember} onQuickAdd={onQuickAdd}
          onApplyRotation={onApplyRotation}
        />
        <GapFixPanel onFixGaps={onFixGaps} gapFixResult={gapFixResult} onAssignOtFromGap={onAssignOtFromGap} />
      </div>
    </div>
  );
}
