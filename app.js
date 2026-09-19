import {
    auth, db, provider, signInWithPopup, signOut, onAuthStateChanged,
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy
} from "./firebase.js";

let currentUser = null;
let issues = [];
let deleteTargetIssue = null;
let editTargetIssue = null;
let activeView = "active";

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen"), appScreen = $("app");
const googleLoginBtn = $("googleLoginBtn"), logoutBtn = $("logoutBtn");
const userName = $("userName"), userAvatar = $("userAvatar");
const addIssueBtn = $("addIssueBtn"), issueModal = $("issueModal");
const closeModalBtn = $("closeModalBtn"), cancelIssueBtn = $("cancelIssueBtn");
const issueForm = $("issueForm"), issuesList = $("issuesList");
const searchInput = $("searchInput"), statusFilter = $("statusFilter"), priorityFilter = $("priorityFilter");
const clearFiltersBtn = $("clearFiltersBtn");
const activeViewBtn = $("activeViewBtn"), historyViewBtn = $("historyViewBtn");
const deleteModal = $("deleteModal"), deleteConfirmInput = $("deleteConfirmInput");
const confirmDeleteBtn = $("confirmDeleteBtn"), cancelDeleteBtn = $("cancelDeleteBtn");
const editModal = $("editModal"), editIssueForm = $("editIssueForm");
const assignedButton = $("assignedButton"), assignedButtonText = $("assignedButtonText"), assignedMenu = $("assignedMenu");
const editAssignedButton = $("editAssignedButton"), editAssignedButtonText = $("editAssignedButtonText"), editAssignedMenu = $("editAssignedMenu");

const categoryIcons = {
    Pool:"◉", Garden:"✦", Electrical:"⚡", Plumbing:"⌁",
    "Air Conditioning":"❄", Building:"⌂", Security:"◇",
    Cleaning:"✧", Furniture:"▣", Appliances:"▤", Other:"•"
};

function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function setDueDateMinimums() {
    $("issueDueDate").min = todayString();
    $("editIssueDueDate").min = todayString();
}
setDueDateMinimums();

function setupAssignedPicker(button, buttonText, menu, otherInput) {
    button.addEventListener("click", e => {
        e.stopPropagation();
        document.querySelectorAll(".multi-select-menu").forEach(m => {
            if (m !== menu) m.classList.add("hidden");
        });
        menu.classList.toggle("hidden");
    });
    menu.querySelector(".done-select-button").addEventListener("click", e => {
        e.stopPropagation();
        updateAssignedButton(button, buttonText, menu, otherInput);
        menu.classList.add("hidden");
    });
    menu.addEventListener("click", e => e.stopPropagation());
    menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener("change", () => updateAssignedButton(button, buttonText, menu, otherInput));
    });
    otherInput.addEventListener("input", () => updateAssignedButton(button, buttonText, menu, otherInput));
}
function updateAssignedButton(button, buttonText, menu, otherInput) {
    const values = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.value);
    const custom = otherInput.value.trim();
    if (custom) values.push(custom);
    buttonText.textContent = values.length ? values.join(", ") : "Select people / teams";
    button.classList.toggle("has-selection", values.length > 0);
}
function getAssignedValues(menu, otherInput) {
    const values = [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.value);
    const custom = otherInput.value.trim();
    if (custom) values.push(custom);
    return [...new Set(values)];
}
function setAssignedValues(menu, otherInput, button, buttonText, rawValue) {
    const values = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
    menu.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = values.includes(cb.value));
    const known = new Set([...menu.querySelectorAll('input[type="checkbox"]')].map(cb => cb.value));
    otherInput.value = values.filter(v => !known.has(v)).join(", ");
    updateAssignedButton(button, buttonText, menu, otherInput);
}
setupAssignedPicker(assignedButton, assignedButtonText, assignedMenu, $("assignedOther"));
setupAssignedPicker(editAssignedButton, editAssignedButtonText, editAssignedMenu, $("editAssignedOther"));

document.addEventListener("click", () => {
    document.querySelectorAll(".multi-select-menu").forEach(m => m.classList.add("hidden"));
});

googleLoginBtn.addEventListener("click", async () => {
    googleLoginBtn.disabled = true;
    googleLoginBtn.querySelector("span:last-child").textContent = "Signing in…";
    try { await signInWithPopup(auth, provider); }
    catch (error) {
        console.error(error);
        alert(`Login failed: ${error.code || error.message || "Please try again."}`);
    }
    finally {
        googleLoginBtn.disabled = false;
        googleLoginBtn.querySelector("span:last-child").textContent = "Continue with Google";
    }
});

logoutBtn.addEventListener("click", async () => {
    try { await signOut(auth); } catch (error) { console.error(error); }
});

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");
        userName.textContent = user.displayName || user.email || "User";
        userAvatar.textContent = initials(user.displayName || user.email || "VC");
        await loadIssues();
    } else {
        currentUser = null;
        loginScreen.classList.remove("hidden");
        appScreen.classList.add("hidden");
    }
});

addIssueBtn.addEventListener("click", () => issueModal.classList.remove("hidden"));
closeModalBtn.addEventListener("click", closeIssueModal);
cancelIssueBtn.addEventListener("click", closeIssueModal);
issueModal.addEventListener("click", e => { if (e.target === issueModal) closeIssueModal(); });

function closeIssueModal() {
    issueModal.classList.add("hidden");
    issueForm.reset();
    setAssignedValues(assignedMenu, $("assignedOther"), assignedButton, assignedButtonText, []);
    setDueDateMinimums();
}

issueForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUser) return;
    const dueDate = $("issueDueDate").value;
    if (dueDate && dueDate < todayString()) {
        alert("Due date cannot be in the past. Please choose today or a future date.");
        $("issueDueDate").focus();
        return;
    }
    const issue = {
        title: $("issueTitle").value.trim(),
        category: $("issueCategory").value,
        priority: $("issuePriority").value,
        assignedTo: getAssignedValues(assignedMenu, $("assignedOther")),
        dueDate,
        cost: Number($("issueCost").value) || 0,
        description: $("issueDescription").value.trim(),
        status: "Open",
        createdAt: new Date().toISOString(),
        createdBy: currentUser.uid
    };
    try {
        await addDoc(collection(db, "issues"), issue);
        closeIssueModal();
        showToast("Issue created");
        await loadIssues();
    } catch (error) {
        console.error(error);
        alert("Could not save the issue.");
    }
});

async function loadIssues() {
    try {
        const issuesQuery = query(collection(db, "issues"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(issuesQuery);
        issues = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        renderIssues();
    } catch (error) {
        console.error(error);
        alert("Could not load maintenance issues.");
    }
}

function renderIssues() {
    const search = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const priority = priorityFilter.value;
    const today = localDateString();

    let filtered = issues.filter(issue => {
        const assignedSearch = Array.isArray(issue.assignedTo) ? issue.assignedTo.join(" ") : (issue.assignedTo || "");
        const matchesSearch = [issue.title, issue.description, issue.category, assignedSearch]
            .some(v => String(v || "").toLowerCase().includes(search));
        const matchesPriority = priority === "all" || issue.priority === priority;
        const isOverdue = issue.status !== "Completed" && issue.dueDate && issue.dueDate < today;

        // Explicit status selection overrides Active/History.
        // This means selecting "Completed" always shows completed records,
        // even if the History tab is not selected.
        const matchesStatus = status === "all" || issue.status === status;
        const viewMatches = status !== "all"
            ? true
            : (activeView === "history" ? issue.status === "Completed" : issue.status !== "Completed");

        return matchesSearch && matchesStatus && matchesPriority && viewMatches;
    });

    filtered.sort((a,b) => {
        if (activeView === "history" || status === "Completed") {
            return dateValue(b.completedAt || b.createdAt) - dateValue(a.completedAt || a.createdAt);
        }
        return (issueRank(b) - issueRank(a)) || (dateValue(b.createdAt) - dateValue(a.createdAt));
    });

    issuesList.innerHTML = "";
    if (!filtered.length) {
        issuesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${activeView === "history" || status === "Completed" ? "✓" : "◌"}</div>
                <h3>${activeView === "history" || status === "Completed" ? "No completed issues" : "Nothing needs attention"}</h3>
                <p>${activeView === "history" || status === "Completed" ? "Completed maintenance will appear here." : "You're all caught up, or nothing matches your filters."}</p>
            </div>`;
    } else {
        filtered.forEach(issue => issuesList.appendChild(createIssueCard(issue)));
    }

    $("issueCount").textContent = `${filtered.length} ${filtered.length === 1 ? "issue" : "issues"}`;
    updateStatistics();
    clearFiltersBtn.classList.toggle("hidden", !(search || status !== "all" || priority !== "all"));
}

function issueRank(issue) {
    const overdue = issue.status !== "Completed" && issue.dueDate && issue.dueDate < localDateString();
    const priority = {Urgent:40, High:30, Normal:20, Low:10}[issue.priority] || 0;
    return (overdue ? 100 : 0) + priority;
}

function createIssueCard(issue) {
    const card = document.createElement("article");
    const completed = issue.status === "Completed";
    const overdue = !completed && issue.dueDate && issue.dueDate < localDateString();
    const priorityClass = `priority-${safeClass(issue.priority)}`;
    card.className = `issue-card ${priorityClass} ${completed ? "completed" : ""} ${overdue ? "overdue-card" : ""}`;

    const dueText = issue.dueDate ? formatDate(issue.dueDate) : "";
    const costText = Number(issue.cost) ? `₹${Number(issue.cost).toLocaleString("en-IN", {maximumFractionDigits:2})}` : "";
    const icon = categoryIcons[issue.category] || "•";
    const categoryClass = `category-${safeClass(issue.category)}`;
    const assignees = Array.isArray(issue.assignedTo) ? issue.assignedTo : (issue.assignedTo ? [issue.assignedTo] : []);

    card.innerHTML = `
        <div class="issue-main">
            <div>
                <div class="issue-title-row">
                    ${completed ? `<span class="done-check">✓</span>` : ""}
                    <div class="issue-title">${escapeHtml(issue.title)}</div>
                </div>
                ${issue.description ? `<div class="issue-description">${escapeHtml(issue.description)}</div>` : ""}
                <div class="issue-meta">
                    <span class="badge ${categoryClass}">${icon} ${escapeHtml(issue.category || "Other")}</span>
                    <span class="badge priority-${safeClass(issue.priority)}">${escapeHtml(issue.priority || "Normal")}</span>
                    <span class="badge status-${safeClass(issue.status)}">${completed ? "✓ Done" : escapeHtml(issue.status || "Open")}</span>
                    ${assignees.length ? `<span class="badge assignee-chip">👤 ${escapeHtml(assignees.join(" · "))}</span>` : ""}
                    ${dueText ? `<span class="badge ${overdue ? "overdue" : ""}">${overdue ? "⚠ " : "📅 "}${escapeHtml(dueText)}${overdue ? " · Overdue" : ""}</span>` : ""}
                    ${costText ? `<span class="badge">₹ ${costText.replace("₹","")}</span>` : ""}
                    ${completed && issue.completedAt ? `<span class="badge">✓ ${escapeHtml(formatDateTime(issue.completedAt))}</span>` : ""}
                </div>
            </div>
            <div class="issue-actions">
                <select class="status-change" aria-label="Change status">
                    <option ${issue.status === "Open" ? "selected" : ""}>Open</option>
                    <option ${issue.status === "In Progress" ? "selected" : ""}>In Progress</option>
                    <option ${issue.status === "Waiting" ? "selected" : ""}>Waiting</option>
                    <option ${issue.status === "Completed" ? "selected" : ""}>Completed</option>
                </select>
                <button class="more-button" title="More actions" aria-label="More actions">•••</button>
            </div>
        </div>`;

    card.querySelector(".status-change").addEventListener("change", async e => {
        const newStatus = e.target.value;
        try {
            const updates = { status: newStatus };
            if (newStatus === "Completed") updates.completedAt = new Date().toISOString();
            else updates.completedAt = null;
            await updateDoc(doc(db, "issues", issue.id), updates);
            showToast(newStatus === "Completed" ? "Issue marked as done ✓" : `Status changed to ${newStatus}`);
            await loadIssues();
        } catch (error) {
            console.error(error);
            alert("Could not update the issue.");
        }
    });

    const moreButton = card.querySelector(".more-button");
    moreButton.addEventListener("click", e => {
        e.stopPropagation();
        document.querySelectorAll(".more-menu").forEach(m => m.remove());
        const menu = document.createElement("div");
        menu.className = "more-menu";
        menu.innerHTML = `
            <button type="button" class="menu-edit">✎ Edit issue</button>
            <button type="button" class="menu-delete">Delete issue</button>`;
        card.appendChild(menu);
        menu.querySelector(".menu-edit").addEventListener("click", () => {
            menu.remove();
            openEditModal(issue);
        });
        menu.querySelector(".menu-delete").addEventListener("click", () => {
            menu.remove();
            openDeleteModal(issue);
        });
    });

    return card;
}

function updateStatistics() {
    const today = localDateString();
    $("openCount").textContent = issues.filter(i => i.status === "Open").length;
    $("progressCount").textContent = issues.filter(i => i.status === "In Progress").length;
    $("completedCount").textContent = issues.filter(i => i.status === "Completed").length;
    $("overdueCount").textContent = issues.filter(i =>
        i.status !== "Completed" && i.dueDate && i.dueDate < today
    ).length;
}

function openEditModal(issue) {
    editTargetIssue = issue;
    $("editIssueTitle").value = issue.title || "";
    $("editIssueCategory").value = issue.category || "";
    $("editIssuePriority").value = issue.priority || "Normal";
    setAssignedValues(editAssignedMenu, $("editAssignedOther"), editAssignedButton, editAssignedButtonText, issue.assignedTo);
    $("editIssueDueDate").value = issue.dueDate || "";
    const editDueHelp = $("editDueHelp");
    if (issue.dueDate && issue.dueDate < todayString()) {
        $("editIssueDueDate").removeAttribute("min");
        editDueHelp.textContent = "This issue is already overdue. Leave the date unchanged or choose today / a future date.";
    } else {
        $("editIssueDueDate").min = todayString();
        editDueHelp.textContent = "Choose today or a future date.";
    }
    $("editIssueCost").value = Number(issue.cost) || "";
    $("editIssueStatus").value = issue.status || "Open";
    $("editIssueDescription").value = issue.description || "";
    editModal.classList.remove("hidden");
    setTimeout(() => $("editIssueTitle").focus(), 50);
}
function closeEditModal() {
    editTargetIssue = null;
    editModal.classList.add("hidden");
    editIssueForm.reset();
}
$("closeEditModalBtn").addEventListener("click", closeEditModal);
$("cancelEditBtn").addEventListener("click", closeEditModal);
editModal.addEventListener("click", e => { if (e.target === editModal) closeEditModal(); });

editIssueForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!editTargetIssue) return;
    const newStatus = $("editIssueStatus").value;
    const newDueDate = $("editIssueDueDate").value;
    if (newDueDate && newDueDate < todayString() && newDueDate !== (editTargetIssue.dueDate || "")) {
        alert("Due date cannot be in the past. Please choose today or a future date.");
        $("editIssueDueDate").focus();
        return;
    }
    const updates = {
        title: $("editIssueTitle").value.trim(),
        category: $("editIssueCategory").value,
        priority: $("editIssuePriority").value,
        assignedTo: getAssignedValues(editAssignedMenu, $("editAssignedOther")),
        dueDate: $("editIssueDueDate").value,
        cost: Number($("editIssueCost").value) || 0,
        status: newStatus,
        description: $("editIssueDescription").value.trim()
    };
    if (newStatus === "Completed") updates.completedAt = editTargetIssue.completedAt || new Date().toISOString();
    else updates.completedAt = null;

    try {
        await updateDoc(doc(db, "issues", editTargetIssue.id), updates);
        closeEditModal();
        showToast("Issue updated");
        await loadIssues();
    } catch (error) {
        console.error(error);
        alert("Could not update the issue.");
    }
});

function openDeleteModal(issue) {
    deleteTargetIssue = issue;
    $("deleteTarget").textContent = issue.title || "Untitled issue";
    deleteConfirmInput.value = "";
    confirmDeleteBtn.disabled = true;
    deleteModal.classList.remove("hidden");
    setTimeout(() => deleteConfirmInput.focus(), 50);
}

function closeDeleteModal() {
    deleteTargetIssue = null;
    deleteConfirmInput.value = "";
    confirmDeleteBtn.disabled = true;
    deleteModal.classList.add("hidden");
}
cancelDeleteBtn.addEventListener("click", closeDeleteModal);
deleteModal.addEventListener("click", e => { if (e.target === deleteModal) closeDeleteModal(); });
deleteConfirmInput.addEventListener("input", () => {
    confirmDeleteBtn.disabled = deleteConfirmInput.value !== "DELETE";
});
confirmDeleteBtn.addEventListener("click", async () => {
    if (!deleteTargetIssue || deleteConfirmInput.value !== "DELETE") return;
    try {
        await deleteDoc(doc(db, "issues", deleteTargetIssue.id));
        closeDeleteModal();
        showToast("Issue deleted");
        await loadIssues();
    } catch (error) {
        console.error(error);
        alert("Could not delete the issue.");
    }
});

searchInput.addEventListener("input", renderIssues);
statusFilter.addEventListener("change", renderIssues);
priorityFilter.addEventListener("change", renderIssues);

clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    statusFilter.value = "all";
    priorityFilter.value = "all";
    renderIssues();
});

activeViewBtn.addEventListener("click", () => setView("active"));
historyViewBtn.addEventListener("click", () => setView("history"));

function setView(view) {
    activeView = view;
    // Tabs are the broad view. Choosing a specific status remains the explicit override.
    statusFilter.value = "all";
    activeViewBtn.classList.toggle("active", view === "active");
    historyViewBtn.classList.toggle("active", view === "history");
    renderIssues();
}

document.querySelectorAll("[data-status-shortcut]").forEach(button => {
    button.addEventListener("click", () => {
        const value = button.dataset.statusShortcut;
        if (value === "overdue") {
            statusFilter.value = "all";
            priorityFilter.value = "all";
            searchInput.value = "";
            activeView = "active";
            activeViewBtn.classList.add("active");
            historyViewBtn.classList.remove("active");
        } else {
            activeView = value === "Completed" ? "history" : "active";
            activeViewBtn.classList.toggle("active", activeView === "active");
            historyViewBtn.classList.toggle("active", activeView === "history");
            statusFilter.value = value;
        }
        renderIssues();
        window.scrollTo({top: 240, behavior:"smooth"});
    });
});

function localDateString() {
    const d = new Date();
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
}
function formatDate(value) {
    const d = new Date(`${value}T00:00:00`);
    return d.toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"});
}
function formatDateTime(value) {
    const d = new Date(value);
    return d.toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"});
}
document.addEventListener("click", () => {
    document.querySelectorAll(".more-menu").forEach(m => m.remove());
});
function dateValue(value) {
    const n = Date.parse(value || "");
    return Number.isFinite(n) ? n : 0;
}
function safeClass(value) {
    return String(value || "").replace(/[^a-zA-Z0-9-]/g, "-");
}
function initials(value) {
    const parts = String(value).trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length-1][0] : parts[0]?.slice(0,2) || "VC").toUpperCase();
}
function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}
function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2400);
}
