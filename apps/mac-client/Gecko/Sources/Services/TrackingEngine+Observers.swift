import Cocoa

/// Extension that manages all notification observers for TrackingEngine.
///
/// Handles workspace app-activation, screen lock/unlock, system sleep/wake,
/// and Low Power Mode power state changes.
extension TrackingEngine {

    /// Register the workspace app-activation observer.
    func registerWorkspaceObserver() {
        workspaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil, queue: .main
        ) { [weak self] notification in
            Task { @MainActor in
                await self?.handleAppActivation(notification)
            }
        }
    }

    /// Remove the workspace app-activation observer.
    func removeWorkspaceObserver() {
        if let obs = workspaceObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(obs)
            workspaceObserver = nil
        }
    }

    /// Register observers for screen lock/unlock, system sleep/wake, and power state.
    func registerSystemObservers() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        let distCenter = DistributedNotificationCenter.default()

        lockObserver = distCenter.addObserver(
            forName: NSNotification.Name("com.apple.screenIsLocked"),
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.transition(to: .locked) }
        }

        unlockObserver = distCenter.addObserver(
            forName: NSNotification.Name("com.apple.screenIsUnlocked"),
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.transition(to: .active) }
        }

        sleepObserver = workspaceCenter.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.transition(to: .asleep) }
        }

        wakeObserver = workspaceCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.transition(to: .active) }
        }

        powerStateObserver = NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.rescheduleIfNeeded() }
        }
    }

    /// Remove all system observers (lock/unlock, sleep/wake, power state).
    func removeSystemObservers() {
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        let distCenter = DistributedNotificationCenter.default()

        if let obs = lockObserver { distCenter.removeObserver(obs) }
        if let obs = unlockObserver { distCenter.removeObserver(obs) }
        if let obs = sleepObserver { workspaceCenter.removeObserver(obs) }
        if let obs = wakeObserver { workspaceCenter.removeObserver(obs) }
        if let obs = powerStateObserver { NotificationCenter.default.removeObserver(obs) }

        lockObserver = nil
        unlockObserver = nil
        sleepObserver = nil
        wakeObserver = nil
        powerStateObserver = nil
    }
}
