# Restaurant ERP System
## Functional Requirements, Technical Architecture, and Implementation Plan

**Document Type:** Software Requirements and Technical Implementation Documentation  
**System:** Restaurant Enterprise Resource Planning (ERP)  
**Architecture:** React + Vite + Supabase  
**Version:** 1.0

---

## 1. Project Overview

The Restaurant ERP System is a centralized platform designed to manage the restaurant's daily operations, including point of sale, order processing, kitchen workflows, menu and recipe management, inventory, expenses, employees, and business performance.

The system provides a unified interface and shared data model so that operational activities are reflected consistently across all modules.

The platform also supports offline operation for essential workflows and includes an AI module for daily business reports and an interactive assistant.

### 1.1 Project Objectives

- Centralize restaurant operations in one integrated system.
- Simplify order creation, payment processing, and kitchen coordination.
- Track ingredient usage, inventory levels, waste, and stock movements.
- Calculate meal production costs and profit margins.
- Monitor sales, expenses, and operational performance.
- Manage employees, roles, permissions, and activity history.
- Support real-time updates between connected workstations.
- Preserve essential operations during temporary internet interruptions.
- Provide AI-assisted analysis based on authorized restaurant data.

---

## 2. Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Build the application interface and frontend modules |
| UI Design | Tailwind CSS | Create responsive and consistent user interfaces |
| Backend / Cloud Services | Supabase | Provide backend services and centralized application infrastructure |
| Database | PostgreSQL (Supabase) | Store restaurant, operational, and financial data |
| Authentication | Supabase Auth | Handle sign-in, sessions, and user authentication |
| Authorization | PostgreSQL Row Level Security (RLS) | Enforce data access permissions |
| Cloud Storage | Supabase Storage | Store meal images, receipts, and documents |
| Real-time Updates | Supabase Realtime | Deliver live order, kitchen, and inventory updates |
| AI Integration | Gemini API | Generate business analysis and power the AI assistant |
| Server-side AI | Supabase Edge Functions | Securely execute AI requests without exposing API keys |
| Offline Storage | IndexedDB | Store local data and pending operations |
| Offline Synchronization | IndexedDB + Supabase | Synchronize locally queued operations with the central database |
| Charts & Analytics | Recharts | Display sales, expenses, and performance charts |
| Frontend Hosting | Hostinger | Publish and serve the React application |

### 2.1 Architecture Overview

The application uses React and Vite for the frontend. Supabase provides the primary backend services, including PostgreSQL, authentication, storage, and real-time data delivery.

IndexedDB provides local persistence for supported offline workflows. When connectivity is restored, a synchronization service submits queued operations to Supabase and reconciles their results.

AI requests are routed through Supabase Edge Functions. The Gemini API key remains server-side and is never included in frontend code.

Hostinger hosts the frontend application. Supabase provides the database and backend services independently of the frontend hosting provider.

### 2.2 Main Architecture Layers

1. **Presentation Layer:** React, Vite, Tailwind CSS, and Recharts.
2. **Application and Data Services:** Supabase client integration and application business logic.
3. **Backend Services:** Supabase Auth, PostgreSQL, Storage, Realtime, and Edge Functions.
4. **Offline Layer:** IndexedDB and a synchronization queue.
5. **AI Layer:** Gemini API accessed through Supabase Edge Functions.
6. **Deployment Layer:** Hostinger for frontend hosting and Supabase for backend services.

---

# 3. Functional Modules and Technical Implementation

## 3.1 Point of Sale (POS)

### Functional Requirements

- Display available meals in an organized grid grouped by category.
- Add meals to the order cart.
- Increase, decrease, or remove item quantities.
- Support multiple order types:
  - Dine-in
  - Takeaway
  - Delivery
- Display required fields dynamically according to the selected order type.
- Calculate subtotal, discounts, taxes, service charges, and final total.
- Support configured payment methods.
- Record payment details and transaction status.
- Provide a **Send to Kitchen** action to submit an order to the kitchen.
- Provide a **Pay & Complete** action to process payment and complete an order.
- Associate each transaction with the responsible employee.
- Preserve supported POS operations locally when the internet connection is unavailable.

### Technical Implementation

- **React:** Build the POS interface, meal grid, cart, and checkout workflow.
- **Tailwind CSS:** Style the interface and responsive layouts.
- **PostgreSQL:** Store orders, order items, payments, and transaction records.
- **Supabase Realtime:** Broadcast relevant order updates to connected workstations.
- **IndexedDB:** Persist supported local operations while offline.
- **Supabase Auth:** Identify the employee performing each operation.
- **RLS:** Restrict access to POS data according to user roles.

## 3.2 Orders and Invoices Management

### Functional Requirements

- Display all orders in a searchable and filterable list.
- Filter orders by status, date or date range, order type, payment status, and synchronization status.
- Display complete order details and the invoice associated with each order.
- Track payment methods and transaction details.
- Maintain a chronological history of order status changes.
- Allow authorized users to update order statuses.
- Support order cancellation according to configured permissions and business rules.

### Technical Implementation

- **PostgreSQL:** Store orders, invoices, payments, and status history.
- **React:** Build order lists, filters, details, and invoice views.
- **Supabase Realtime:** Reflect status changes across connected interfaces.
- **RLS:** Restrict access according to employee permissions.
- **IndexedDB:** Retain locally queued operations when offline.
- **Recharts:** Visualize order statistics where required.

## 3.3 Kitchen Display System (KDS)

### Functional Requirements

- Display incoming kitchen orders in real time.


### Technical Implementation

- **React:** Build the kitchen display and order cards.
- **Supabase Realtime:** Receive new orders and status updates.
- **PostgreSQL:** Store order statuses and relevant timestamps.
- **JavaScript:** Manage preparation timers and elapsed-time calculations.
- **Web Audio API:** Implement browser-based audio notifications.
- **Tailwind CSS:** Create a clear interface suitable for kitchen displays.

## 3.4 Menu and Recipe Management

### Functional Requirements

- Create, edit, delete, and categorize meals.
- Manage meal names, descriptions, prices, and images.
- Enable or disable meal availability.
- Define recipes for each meal.
- Specify the ingredients and quantities required by each recipe.
- Calculate meal production costs automatically using ingredient costs.
- Calculate profit per meal and profit margins.
- Update meal costs when ingredient costs change.
- Provide a clear view of each meal's recipe and cost breakdown.

### Technical Implementation

- **PostgreSQL:** Store meals, categories, ingredients, recipes, and recipe items.
- **Supabase Storage:** Store meal images.
- **React:** Build menu and recipe management interfaces.
- **Application Business Logic:** Calculate production costs and profit margins.
- **Database Queries:** Retrieve ingredient costs and calculate recipe totals.


## 3.6 Expenses Management

### Functional Requirements

- Provide a quick form for recording expenses.
- Categorize expenses, including rent, salaries, utilities, maintenance, supplies, and other operational expenses.
- Record the expense amount, date, category, description, and responsible employee.
- Display expenses in a searchable and filterable list.
- Filter expenses by date range and category.
- Display expense distribution through charts.
- Calculate total expenses for a selected period.
- Allow authorized users to attach supporting receipts or documents.

### Technical Implementation

- **React:** Build expense forms, lists, and filters.
- **PostgreSQL:** Store expense records and categories.
- **Recharts:** Visualize expense distribution and trends.
- **Supabase Storage:** Store receipt and document attachments.
- **Supabase Auth:** Identify the employee who records each expense.
- **RLS:** Restrict expense visibility and editing according to permissions.

## 3.7 Owner Dashboard

### Functional Requirements

- Display key business performance indicators for a selected period.
- Compare current performance with previous periods.
- Display total sales and revenue.
- Display total orders and average order value.
- Show ongoing orders and their statuses.
- Visualize sales trends through interactive charts.
- Identify the best-selling and least-selling meals.
- Show employee performance metrics.
- Display important operational and financial notifications.

### Technical Implementation

- **React:** Build the owner dashboard and its components.
- **PostgreSQL:** Store and query operational and financial data.
- **SQL Views and Aggregate Queries:** Calculate dashboard indicators.
- **Recharts:** Render sales, expense, and performance charts.
- **Supabase Realtime:** Update ongoing orders and selected live indicators.
- **RLS:** Ensure dashboard data is accessible only to authorized users.


### Technical Implementation

- **Gemini API:** Generate AI reports and assistant responses.
- **Supabase Edge Functions:** Execute AI requests securely on the server side.
- **PostgreSQL:** Retrieve the restaurant data required for analysis.
- **Supabase Auth:** Verify the requesting user's identity.
- **Authorization and RLS:** Ensure users can only access data permitted by their roles.
- **Recharts:** Display relevant analytical data in report interfaces.

**Security Requirement:** The Gemini API key must be stored in server-side environment secrets. It must never be exposed in React code, browser requests, or publicly accessible configuration files. Data sent to the AI service must be limited to the information required for the user's authorized request.

## 3.9 Employee Management

### Functional Requirements

- Add, edit, and deactivate employee accounts.
- Manage employee information and job roles.
- Define role-based permissions.
- Restrict access to modules and operations according to assigned permissions.
- Track employee activities and operational responsibilities.
- Associate orders, payments, and expenses with the responsible employee.

### Technical Implementation

- **Supabase Auth:** Manage authentication and user sessions.
- **PostgreSQL:** Store employee profiles, roles, and permission records.
- **RLS:** Enforce data access policies.
- **React:** Build employee management interfaces.
- **Role-Based Access Control (RBAC):** Apply permissions consistently across the application and database.

## 3.10 Activity Log

### Functional Requirements

- Maintain a chronological record of important system activities.
- Record order creation and modification.
- Record payment operations.
- Record inventory adjustments and stocktaking.
- Record expense registration and modification.
- Record menu and recipe changes.
- Record employee and permission changes.
- Store the responsible user, action type, affected record, and timestamp.
- Provide searchable and filterable activity history.
- Protect audit records from unauthorized modification.

### Technical Implementation

- **PostgreSQL:** Store activity log records.
- **Database Triggers and Application Events:** Capture important changes.
- **React:** Display activity history and filters.
- **RLS and Database Permissions:** Restrict access to audit records.
- **Supabase Auth:** Associate actions with authenticated users.

## 3.11 System Settings

### Functional Requirements

- Configure restaurant information and business details.
- Configure taxes, service charges, and default discounts.
- Configure order types and their required fields.
- Manage payment methods.
- Configure order statuses and operational settings.
- Manage meal and expense categories.
- Configure invoice and receipt settings.
- Manage employee roles and permissions.

### Technical Implementation

- **PostgreSQL:** Store restaurant and application settings.
- **React:** Build settings interfaces.
- **Supabase Auth and RLS:** Restrict access to authorized administrators.
- **Supabase Storage:** Store relevant restaurant documents and assets when needed.

## 3.12 Data Synchronization and Offline Management

### Functional Requirements

- Display the current synchronization status.
- Show completed, pending, and failed synchronization operations.
- Maintain a queue of operations awaiting synchronization.
- Retry failed synchronization operations.
- Prevent duplicate orders and transactions during synchronization.
- Detect and handle data conflicts.
- Preserve data consistency between local and central storage.
- Keep essential POS workflows available during temporary internet interruptions.
- Notify users when operations are waiting to synchronize or require attention.

### Technical Implementation

- **IndexedDB:** Store local application data and pending operations.
- **JavaScript:** Manage the offline queue and synchronization workflow.
- **Supabase:** Store synchronized data centrally.
- **Supabase Realtime:** Receive updates when connectivity is available.
- **Unique Operation IDs:** Identify operations and prevent duplicate processing.
- **Retry Mechanism:** Retry failed synchronization operations with controlled backoff.
- **Conflict Resolution:** Apply explicit rules for conflicting updates.
- **React:** Display synchronization status and notifications.

**Important:** IndexedDB alone does not provide synchronization or guarantee transaction safety. The application must implement an explicit queue, operation identifiers, retry handling, conflict-resolution rules, and server-side idempotency. Payment processing must be designed carefully so that an offline retry cannot create duplicate charges.

---

# 4. Database Design: Core Entities

PostgreSQL will be the central data store connecting all ERP modules.

| Entity / Table | Responsibility |
|---|---|
| profiles | User profile information linked to authentication accounts |
| roles | Employee roles |
| permissions | Available system permissions |
| categories | Meal categories |
| menu_items | Meal information, prices, and availability |
| ingredients | Ingredient definitions and units |
| recipes | Recipe definitions for meals |
| recipe_items | Ingredients and quantities used in each recipe |
| orders | Order headers and order-level information |
| order_items | Meals, quantities, and prices within each order |
| order_status_history | Chronological order status changes |
| payments | Payment records and transaction status |
| invoices | Invoice information |
| inventory | Current ingredient stock balances |
| inventory_transactions | Stock additions, consumption, waste, and adjustments |
| suppliers | Supplier information |
| expenses | Expense records |
| employees | Employee information |
| activity_logs | Audit and activity records |
| restaurant_settings | Restaurant and application settings |
| sync_operations | Synchronization operation records and statuses |
| ai_reports | Generated AI report records |

### 4.1 Database Design Considerations

- Use primary keys and foreign keys to maintain relationships.
- Use appropriate indexes for frequently filtered fields, such as order date, status, and employee ID.
- Store monetary values using appropriate fixed-precision numeric types.
- Store timestamps consistently and display them in the restaurant's configured local timezone.
- Preserve historical transaction prices and costs where required instead of recalculating past records from current menu prices.
- Use database transactions for operations that update multiple related records.
- Apply RLS policies to tables containing protected business or employee data.
- Define retention and archival rules for audit and transaction history.

---

# 5. Core ERP Workflow Integration

All modules must operate as parts of one integrated system rather than as independent screens.

| Integration | Description |
|---|---|
| POS → Orders | Every submitted order is registered in order management |
| POS → Kitchen | New kitchen orders appear on the kitchen display |
| Kitchen → Orders | Kitchen status changes are reflected in order tracking |
| Orders → Inventory | Ingredient consumption is recorded according to recipes and the configured order lifecycle |
| Inventory → Menu | Ingredient cost changes update meal production costs and profit margins |
| POS → Dashboard | Sales and order indicators are updated |
| Expenses → Dashboard | Recorded expenses contribute to financial indicators |
| Employees → Activity Log | Important employee actions are recorded |
| All Modules → AI | Authorized business data is made available for AI analysis |
| All Modules → Offline Sync | Supported operations are queued locally and synchronized when connectivity returns |

### 5.1 Key Business Rules

- An order must have a clearly defined lifecycle and valid status transitions.
- Sending an order to the kitchen must not automatically imply that payment has been completed.
- Payment completion and order completion must follow explicitly defined business rules.
- Ingredient deduction must occur at a defined point in the order lifecycle and must not happen twice.
- Cancelled or refunded orders must follow explicit inventory and payment reversal rules.
- Historical invoices must preserve the prices, taxes, and discounts applied at the time of the transaction.
- Stock changes must be recorded as inventory transactions, not only as direct balance edits.
- Sensitive actions must be permission-controlled and recorded in the activity log.

---

# 6. Security, Data Integrity, and Reliability

- Use Supabase Auth for authentication and session management.
- Apply Row Level Security to all relevant database tables.
- Separate permissions for owners, managers, cashiers, kitchen staff, and inventory staff.
- Keep service-role keys and third-party API keys on the server side.
- Use database transactions for financial and inventory operations.
- Use unique operation identifiers and idempotent server-side processing to prevent duplicate operations.
- Maintain audit records for important business actions.
- Validate data before accepting or storing it.
- Handle connection failures and synchronization errors without silently losing queued operations.
- Configure database backups and test the restoration process.
- Apply appropriate access restrictions to uploaded files in Supabase Storage.
- Avoid exposing sensitive business information in frontend logs or error messages.

---

# 7. Development Phases

| Phase | Scope |
|---|---|
| Phase 1 | Project setup, React, Vite, Tailwind CSS, Supabase configuration, and database design |
| Phase 2 | Authentication, employee profiles, roles, and permissions |
| Phase 3 | Menu management, ingredients, categories, and recipes |
| Phase 4 | POS, orders, payments, and invoices |
| Phase 5 | Kitchen Display System and real-time updates |
| Phase 6 | Inventory, stock movements, waste, and stocktaking |
| Phase 7 | Expenses and Owner Dashboard |
| Phase 8 | Activity Log and System Settings |
| Phase 9 | Offline Storage and Synchronization |
| Phase 10 | Gemini integration, daily AI reports, and AI assistant |
| Phase 11 | Testing, security review, performance checks, and Hostinger deployment |

---

# 8. Testing and Acceptance Criteria

The system should be tested at both module and end-to-end levels.

### 8.1 Functional Testing

- Verify order creation for every supported order type.
- Verify cart calculations, discounts, taxes, and totals.
- Verify payment and invoice generation.
- Verify that submitted kitchen orders appear on the KDS.
- Verify valid kitchen status transitions.
- Verify recipe-based ingredient consumption.
- Verify inventory additions, waste, and stock adjustments.
- Verify meal cost and profit margin calculations.
- Verify expense totals and dashboard indicators.
- Verify employee permissions and activity logging.

### 8.2 Real-time Testing

- Verify that new orders appear on the kitchen display without manual refresh.
- Verify that kitchen status changes appear in order management.
- Verify that relevant inventory updates are reflected across connected interfaces.
- Test behavior when a client disconnects and reconnects.

### 8.3 Offline Testing

- Disconnect the client from the internet and test supported POS operations.
- Confirm that pending operations remain stored locally after a page reload.
- Restore connectivity and verify that queued operations synchronize.
- Verify that retries do not create duplicate orders or payments.
- Test conflict handling and failed synchronization recovery.

### 8.4 Security Testing

- Verify access restrictions for every employee role.
- Confirm that unauthorized users cannot read or modify protected records.
- Verify that AI requests enforce user permissions.
- Confirm that API keys and privileged credentials are not exposed in frontend assets.
- Verify that audit records cannot be modified by unauthorized users.

---

# 9. Deployment Plan

### Frontend Deployment

- Build the production frontend using Vite.
- Configure production environment variables.
- Deploy the generated frontend assets to Hostinger.
- Configure the application domain and HTTPS.
- Configure client-side routing fallback so direct navigation to application routes works correctly.

### Supabase Configuration

- Configure the production PostgreSQL database.
- Apply database schema migrations.
- Configure Supabase Auth providers and redirect URLs.
- Apply and test RLS policies.
- Configure Storage buckets and access policies.
- Enable the required Realtime publication and table configuration.
- Deploy Supabase Edge Functions.
- Store Gemini credentials in server-side secrets.
- Configure backups and operational monitoring.

---

# 10. Final Project Objective

The objective is to build a centralized and integrated Restaurant ERP System that manages the restaurant's complete operational lifecycle, from order creation and kitchen preparation to menu management, inventory control, expenses, employee administration, and business performance monitoring.

The system will use React, Vite, Tailwind CSS, and Supabase to provide a modern application architecture. PostgreSQL will serve as the central database, while Supabase Auth, Storage, and Realtime will support authentication, file management, and live updates.

IndexedDB will support selected offline workflows, with an explicit synchronization mechanism to preserve queued operations. Gemini, accessed through Supabase Edge Functions, will provide daily business analysis and an interactive assistant.

**Expected Outcome:** A secure, maintainable, and extensible restaurant management platform that connects all essential restaurant operations through a unified interface and consistent data model.
