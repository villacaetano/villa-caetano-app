import {
    auth, db, provider, signInWithPopup, signOut, onAuthStateChanged,
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy
} from "./firebase.js";

let currentUser = null;
let issues = [];
let deleteTargetIssue = null;
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

const categoryIcons = {
    Pool:"◉", Garden:"✦", Electrical:"⚡", Plumbing:"⌁",
    "Air Conditioning":"❄", Building:"⌂", Security:"◇",
    Cleaning:"✧", Furniture:"▣", Appliances:"▤", Other:"•"
};

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
}

issueForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUser) return;
    const issue = {
        title: $("issueTitle").value.trim(),
        category: $("issueCategory").value,
        priority: $("issuePriority").value,
        assignedTo: $("issueAssigned").value.trim(),
        dueDate: $("issueDueDate").value,
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
        const matchesSearch = [issue.title, issue.description, issue.category, issue.assignedTo]
            .some(v => String(v || "").toLowerCase().includes(search));
        const matchesStatus = status === "all" || issue.status === status;
        const matchesPriority = priority === "all" || issue.priority === priority;
        const isOverdue = issue.status !== "Completed" && issue.dueDate && issue.dueDate < today;

        const matchesView = activeView === "history"
            ? issue.status === "Completed"
            : issue.status !== "Completed";

        return matchesSearch && matchesStatus && matchesPriority && matchesView;
    });

    // Put overdue and urgent active work first; completed history stays newest-first.
    filtered.sort((a,b) => {
        if (activeView === "history") return dateValue(b.createdAt) - dateValue(a.createdAt);
        const score = issueRank(b) - issueRank(a);
        return score || (dateValue(b.createdAt) - dateValue(a.createdAt));
    });

    issuesList.innerHTML = "";
    if (!filtered.length) {
        issuesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${activeView === "history" ? "✓" : "◌"}</div>
                <h3>${activeView === "history" ? "No completed issues" : "Nothing needs attention"}</h3>
                <p>${activeView === "history" ? "Completed maintenance will appear here." : "You're all caught up, or nothing matches your filters."}</p>
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
    card.className = `issue-card ${priorityClass} ${completed ? "completed" : ""}`;

    const dueText = issue.dueDate ? formatDate(issue.dueDate) : "";
    const costText = Number(issue.cost) ? `₹${Number(issue.cost).toLocaleString("en-IN", {maximumFractionDigits:2})}` : "";
    const icon = categoryIcons[issue.category] || "•";

    card.innerHTML = `
        <div class="issue-main">
            <div>
                <div class="issue-title-row">
                    ${completed ? `<span class="done-check">✓</span>` : ""}
                    <div class="issue-title">${escapeHtml(issue.title)}</div>
                </div>
                ${issue.description ? `<div class="issue-description">${escapeHtml(issue.description)}</div>` : ""}
                <div class="issue-meta">
                    <span class="badge">${icon} ${escapeHtml(issue.category || "Other")}</span>
                    <span class="badge priority-${safeClass(issue.priority)}">${escapeHtml(issue.priority || "Normal")}</span>
                    <span class="badge status-${safeClass(issue.status)}">${completed ? "✓ Done" : escapeHtml(issue.status || "Open")}</span>
                    ${issue.assignedTo ? `<span class="badge">👤 ${escapeHtml(issue.assignedTo)}</span>` : ""}
                    ${dueText ? `<span class="badge ${overdue ? "overdue" : ""}">${overdue ? "⚠ " : "📅 "}${escapeHtml(dueText)}${overdue ? " · Overdue" : ""}</span>` : ""}
                    ${costText ? `<span class="badge">₹ ${costText.replace("₹","")}</span>` : ""}
                </div>
            </div>
            <div class="issue-actions">
                <select class="status-change" aria-label="Change status">
                    <option ${issue.status === "Open" ? "selected" : ""}>Open</option>
                    <option ${issue.status === "In Progress" ? "selected" : ""}>In Progress</option>
                    <option ${issue.status === "Waiting" ? "selected" : ""}>Waiting</option>
                    <option ${issue.status === "Completed" ? "selected" : ""}>Completed</option>
                </select>
                <button class="delete-button" title="Delete issue" aria-label="Delete issue">⌫</button>
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

    card.querySelector(".delete-button").addEventListener("click", () => openDeleteModal(issue));
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
