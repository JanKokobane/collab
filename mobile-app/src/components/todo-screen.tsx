import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeTask } from '@/lib/homeApi';

type TodoScreenProps = {
  tasks: HomeTask[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onToggleTask: (task: HomeTask) => Promise<void>;
};

function isDone(status: string) {
  return status.trim().toLowerCase() === 'done';
}

function formatDueDate(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return `Due ${value}`;
  return `Due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function TodoScreen({
  tasks,
  loading,
  error,
  onRetry,
  onToggleTask,
}: TodoScreenProps) {
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const openTasks = tasks.filter((task) => !isDone(task.status));
  const sortedTasks = [...tasks].sort((a, b) => Number(isDone(a.status)) - Number(isDone(b.status)));

  async function toggleTask(task: HomeTask) {
    if (updatingTaskId) return;
    setUpdatingTaskId(task.id);
    try {
      await onToggleTask(task);
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR WORK</Text>
          <Text style={styles.title}>To-do</Text>
          <Text style={styles.subtitle}>
            {openTasks.length === 0
              ? 'You’re all caught up.'
              : `${openTasks.length} task${openTasks.length === 1 ? '' : 's'} left to do`}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.count}>{openTasks.length}</Text>
          <Text style={styles.countLabel}>OPEN</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color="#A47E00" />
          <Text style={styles.stateText}>Loading your tasks…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : sortedTasks.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.emptyTitle}>No tasks yet</Text>
          <Text style={styles.stateText}>Tasks from your project workspaces will appear here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {sortedTasks.map((task) => {
            const done = isDone(task.status);
            const updating = updatingTaskId === task.id;
            return (
              <View key={task.id} style={[styles.taskCard, done && styles.taskDone]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done, disabled: !!updatingTaskId }}
                  accessibilityLabel={`${done ? 'Reopen' : 'Complete'} task: ${task.title}`}
                  disabled={!!updatingTaskId}
                  onPress={() => { void toggleTask(task); }}
                  style={styles.checkboxButton}>
                  {updating ? (
                    <ActivityIndicator size="small" color="#3D8A75" />
                  ) : (
                    <View style={[styles.checkbox, done && styles.checkboxChecked]}>
                      {done && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  )}
                </Pressable>
                <View style={styles.taskCopy}>
                  <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>{task.title}</Text>
                  <Text style={styles.taskMeta}>{formatDueDate(task.dueDate)} · {task.status || 'To do'}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  eyebrow: { color: '#8C8B84', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  title: { marginTop: 4, color: '#202020', fontSize: 25, lineHeight: 30, fontWeight: '800' },
  subtitle: { marginTop: 4, color: '#77766F', fontSize: 11 },
  countBadge: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FFF5D2' },
  count: { color: '#725900', fontSize: 17, fontWeight: '800' },
  countLabel: { color: '#89752C', fontSize: 7, fontWeight: '800', letterSpacing: 0.6 },
  list: { gap: 8 },
  taskCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E8E8E5', borderRadius: 12, backgroundColor: '#FFFFFF' },
  taskDone: { backgroundColor: '#FAFBFA' },
  checkboxButton: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#BCC4BE', borderRadius: 6, backgroundColor: '#FFFFFF' },
  checkboxChecked: { borderColor: '#3D8A75', backgroundColor: '#3D8A75' },
  checkmark: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '800' },
  taskCopy: { flex: 1, gap: 5 },
  taskTitle: { color: '#29292D', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  taskTitleDone: { color: '#929790', textDecorationLine: 'line-through' },
  taskMeta: { color: '#858982', fontSize: 9 },
  stateCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18, borderWidth: 1, borderColor: '#E8E8E5', borderRadius: 14, backgroundColor: '#FFFFFF' },
  stateText: { color: '#77766F', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  emptyTitle: { color: '#252521', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#9F2D25', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  retryButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FFF0EF' },
  retryText: { color: '#9F2D25', fontSize: 10, fontWeight: '800' },
});
