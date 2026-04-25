--
-- PostgreSQL database dump
--

-- Dumped from database version 15.17 (Debian 15.17-1.pgdg13+1)
-- Dumped by pg_dump version 17.0

-- Started on 2026-04-25 07:43:26

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE vlworkhub;
--
-- TOC entry 3837 (class 1262 OID 16384)
-- Name: vlworkhub; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE vlworkhub WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.utf8';


ALTER DATABASE vlworkhub OWNER TO postgres;

\connect vlworkhub

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 16399)
-- Name: care; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA care;


ALTER SCHEMA care OWNER TO postgres;

--
-- TOC entry 8 (class 2615 OID 16400)
-- Name: hr; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA hr;


ALTER SCHEMA hr OWNER TO postgres;

--
-- TOC entry 9 (class 2615 OID 16401)
-- Name: ursafe; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA ursafe;


ALTER SCHEMA ursafe OWNER TO postgres;

--
-- TOC entry 2 (class 3079 OID 16402)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 3838 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 218 (class 1259 OID 16439)
-- Name: clients; Type: TABLE; Schema: care; Owner: postgres
--

CREATE TABLE care.clients (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    status text,
    program text,
    primary_contact text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE care.clients OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16445)
-- Name: clients_id_seq; Type: SEQUENCE; Schema: care; Owner: postgres
--

CREATE SEQUENCE care.clients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE care.clients_id_seq OWNER TO postgres;

--
-- TOC entry 3839 (class 0 OID 0)
-- Dependencies: 219
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: care; Owner: postgres
--

ALTER SEQUENCE care.clients_id_seq OWNED BY care.clients.id;


--
-- TOC entry 220 (class 1259 OID 16446)
-- Name: incidents; Type: TABLE; Schema: care; Owner: postgres
--

CREATE TABLE care.incidents (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    severity text,
    reported_by text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE care.incidents OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16452)
-- Name: incidents_id_seq; Type: SEQUENCE; Schema: care; Owner: postgres
--

CREATE SEQUENCE care.incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE care.incidents_id_seq OWNER TO postgres;

--
-- TOC entry 3840 (class 0 OID 0)
-- Dependencies: 221
-- Name: incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: care; Owner: postgres
--

ALTER SEQUENCE care.incidents_id_seq OWNED BY care.incidents.id;


--
-- TOC entry 222 (class 1259 OID 16453)
-- Name: notes; Type: TABLE; Schema: care; Owner: postgres
--

CREATE TABLE care.notes (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    client_id bigint,
    staff_id bigint,
    note_text text,
    visibility text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE care.notes OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16459)
-- Name: notes_id_seq; Type: SEQUENCE; Schema: care; Owner: postgres
--

CREATE SEQUENCE care.notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE care.notes_id_seq OWNER TO postgres;

--
-- TOC entry 3841 (class 0 OID 0)
-- Dependencies: 223
-- Name: notes_id_seq; Type: SEQUENCE OWNED BY; Schema: care; Owner: postgres
--

ALTER SEQUENCE care.notes_id_seq OWNED BY care.notes.id;


--
-- TOC entry 224 (class 1259 OID 16460)
-- Name: staff; Type: TABLE; Schema: care; Owner: postgres
--

CREATE TABLE care.staff (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    role text,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE care.staff OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16466)
-- Name: staff_id_seq; Type: SEQUENCE; Schema: care; Owner: postgres
--

CREATE SEQUENCE care.staff_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE care.staff_id_seq OWNER TO postgres;

--
-- TOC entry 3842 (class 0 OID 0)
-- Dependencies: 225
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: care; Owner: postgres
--

ALTER SEQUENCE care.staff_id_seq OWNED BY care.staff.id;


--
-- TOC entry 226 (class 1259 OID 16467)
-- Name: announcements; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.announcements (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    audience text,
    publish_date date,
    start_date date,
    end_date date,
    priority text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.announcements OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16473)
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.announcements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.announcements_id_seq OWNER TO postgres;

--
-- TOC entry 3843 (class 0 OID 0)
-- Dependencies: 227
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.announcements_id_seq OWNED BY hr.announcements.id;


--
-- TOC entry 228 (class 1259 OID 16474)
-- Name: document_assignments; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.document_assignments (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    document_id bigint NOT NULL,
    user_id uuid,
    department_id uuid,
    all_staff boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.document_assignments OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16479)
-- Name: document_assignments_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.document_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.document_assignments_id_seq OWNER TO postgres;

--
-- TOC entry 3844 (class 0 OID 0)
-- Dependencies: 229
-- Name: document_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.document_assignments_id_seq OWNED BY hr.document_assignments.id;


--
-- TOC entry 230 (class 1259 OID 16480)
-- Name: document_signatures; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.document_signatures (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    document_id bigint NOT NULL,
    signer_name text,
    status text,
    signed_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid
);


ALTER TABLE hr.document_signatures OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16486)
-- Name: document_signatures_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.document_signatures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.document_signatures_id_seq OWNER TO postgres;

--
-- TOC entry 3845 (class 0 OID 0)
-- Dependencies: 231
-- Name: document_signatures_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.document_signatures_id_seq OWNED BY hr.document_signatures.id;


--
-- TOC entry 232 (class 1259 OID 16487)
-- Name: documents; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.documents (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    category text,
    owner_name text,
    storage_path text,
    due_date date,
    requires_signature boolean DEFAULT true,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_name text,
    file_url text,
    category_other text,
    department_id uuid,
    description text,
    sensitive boolean DEFAULT false,
    created_by uuid,
    allow_download boolean DEFAULT false NOT NULL
);


ALTER TABLE hr.documents OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16496)
-- Name: documents_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.documents_id_seq OWNER TO postgres;

--
-- TOC entry 3846 (class 0 OID 0)
-- Dependencies: 233
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.documents_id_seq OWNED BY hr.documents.id;


--
-- TOC entry 293 (class 1259 OID 24629)
-- Name: email_settings; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.email_settings (
    id bigint NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    provider text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_settings_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'outlook'::text])))
);


ALTER TABLE hr.email_settings OWNER TO postgres;

--
-- TOC entry 292 (class 1259 OID 24628)
-- Name: email_settings_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.email_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.email_settings_id_seq OWNER TO postgres;

--
-- TOC entry 3847 (class 0 OID 0)
-- Dependencies: 292
-- Name: email_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.email_settings_id_seq OWNED BY hr.email_settings.id;


--
-- TOC entry 234 (class 1259 OID 16497)
-- Name: employees; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.employees (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    department text,
    job_title text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.employees OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16503)
-- Name: employees_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.employees_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.employees_id_seq OWNER TO postgres;

--
-- TOC entry 3848 (class 0 OID 0)
-- Dependencies: 235
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.employees_id_seq OWNED BY hr.employees.id;


--
-- TOC entry 236 (class 1259 OID 16504)
-- Name: hr_onboarding_expiry_tasks; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.hr_onboarding_expiry_tasks (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    document_type_key text NOT NULL,
    expiry_date date NOT NULL,
    task_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.hr_onboarding_expiry_tasks OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16510)
-- Name: hr_onboarding_expiry_tasks_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.hr_onboarding_expiry_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.hr_onboarding_expiry_tasks_id_seq OWNER TO postgres;

--
-- TOC entry 3849 (class 0 OID 0)
-- Dependencies: 237
-- Name: hr_onboarding_expiry_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.hr_onboarding_expiry_tasks_id_seq OWNED BY hr.hr_onboarding_expiry_tasks.id;


--
-- TOC entry 238 (class 1259 OID 16511)
-- Name: hr_onboarding_uploads; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.hr_onboarding_uploads (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    stored_file_name text NOT NULL,
    original_file_name text NOT NULL,
    document_type text NOT NULL,
    file_url text NOT NULL,
    expiry_date date,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.hr_onboarding_uploads OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 16517)
-- Name: hr_onboarding_uploads_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.hr_onboarding_uploads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.hr_onboarding_uploads_id_seq OWNER TO postgres;

--
-- TOC entry 3850 (class 0 OID 0)
-- Dependencies: 239
-- Name: hr_onboarding_uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.hr_onboarding_uploads_id_seq OWNED BY hr.hr_onboarding_uploads.id;


--
-- TOC entry 240 (class 1259 OID 16518)
-- Name: hr_user_roles; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.hr_user_roles (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    department_id text,
    manager_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    department text,
    CONSTRAINT hr_user_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'employee'::text])))
);


ALTER TABLE hr.hr_user_roles OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 16525)
-- Name: hr_user_roles_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.hr_user_roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.hr_user_roles_id_seq OWNER TO postgres;

--
-- TOC entry 3851 (class 0 OID 0)
-- Dependencies: 241
-- Name: hr_user_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.hr_user_roles_id_seq OWNED BY hr.hr_user_roles.id;


--
-- TOC entry 242 (class 1259 OID 16526)
-- Name: survey_assignments; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.survey_assignments (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text,
    survey_id bigint NOT NULL,
    due_date date,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    department_id uuid,
    all_staff boolean DEFAULT false
);


ALTER TABLE hr.survey_assignments OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 16533)
-- Name: survey_assignments_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.survey_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.survey_assignments_id_seq OWNER TO postgres;

--
-- TOC entry 3852 (class 0 OID 0)
-- Dependencies: 243
-- Name: survey_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.survey_assignments_id_seq OWNED BY hr.survey_assignments.id;


--
-- TOC entry 244 (class 1259 OID 16534)
-- Name: survey_completions; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.survey_completions (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    assignment_id bigint NOT NULL,
    completed_on timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid
);


ALTER TABLE hr.survey_completions OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 16538)
-- Name: survey_completions_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.survey_completions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.survey_completions_id_seq OWNER TO postgres;

--
-- TOC entry 3853 (class 0 OID 0)
-- Dependencies: 245
-- Name: survey_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.survey_completions_id_seq OWNED BY hr.survey_completions.id;


--
-- TOC entry 246 (class 1259 OID 16539)
-- Name: surveys; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.surveys (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    url text,
    due_date date,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


ALTER TABLE hr.surveys OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 16545)
-- Name: surveys_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.surveys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.surveys_id_seq OWNER TO postgres;

--
-- TOC entry 3854 (class 0 OID 0)
-- Dependencies: 247
-- Name: surveys_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.surveys_id_seq OWNED BY hr.surveys.id;


--
-- TOC entry 248 (class 1259 OID 16546)
-- Name: task_assignments; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.task_assignments (
    id integer NOT NULL,
    task_id bigint,
    user_id text,
    department text,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE hr.task_assignments OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 16552)
-- Name: task_assignments_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.task_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.task_assignments_id_seq OWNER TO postgres;

--
-- TOC entry 3855 (class 0 OID 0)
-- Dependencies: 249
-- Name: task_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.task_assignments_id_seq OWNED BY hr.task_assignments.id;


--
-- TOC entry 250 (class 1259 OID 16553)
-- Name: task_completion; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.task_completion (
    id integer NOT NULL,
    task_id bigint,
    user_id uuid,
    completed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status text,
    started_at timestamp without time zone
);


ALTER TABLE hr.task_completion OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 16559)
-- Name: task_completion_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.task_completion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.task_completion_id_seq OWNER TO postgres;

--
-- TOC entry 3856 (class 0 OID 0)
-- Dependencies: 251
-- Name: task_completion_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.task_completion_id_seq OWNED BY hr.task_completion.id;


--
-- TOC entry 252 (class 1259 OID 16560)
-- Name: task_user_states; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.task_user_states (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    task_id bigint NOT NULL,
    user_name text,
    status text,
    completed_on timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.task_user_states OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 16566)
-- Name: task_user_states_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.task_user_states_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.task_user_states_id_seq OWNER TO postgres;

--
-- TOC entry 3857 (class 0 OID 0)
-- Dependencies: 253
-- Name: task_user_states_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.task_user_states_id_seq OWNED BY hr.task_user_states.id;


--
-- TOC entry 254 (class 1259 OID 16567)
-- Name: tasks; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.tasks (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    assigned_to text,
    due_date date,
    status text,
    priority text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived boolean DEFAULT false
);


ALTER TABLE hr.tasks OWNER TO postgres;

--
-- TOC entry 255 (class 1259 OID 16574)
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.tasks_id_seq OWNER TO postgres;

--
-- TOC entry 3858 (class 0 OID 0)
-- Dependencies: 255
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.tasks_id_seq OWNED BY hr.tasks.id;


--
-- TOC entry 256 (class 1259 OID 16575)
-- Name: training; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.training (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    training_name text NOT NULL,
    audience text,
    delivery_mode text,
    video_iframe_link text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quiz_iframe_link text
);


ALTER TABLE hr.training OWNER TO postgres;

--
-- TOC entry 257 (class 1259 OID 16581)
-- Name: training_assignments; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.training_assignments (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text,
    training_id bigint NOT NULL,
    assignee_name text,
    due_date date,
    survey_url text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.training_assignments OWNER TO postgres;

--
-- TOC entry 258 (class 1259 OID 16587)
-- Name: training_assignments_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.training_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.training_assignments_id_seq OWNER TO postgres;

--
-- TOC entry 3859 (class 0 OID 0)
-- Dependencies: 258
-- Name: training_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.training_assignments_id_seq OWNED BY hr.training_assignments.id;


--
-- TOC entry 259 (class 1259 OID 16588)
-- Name: training_completions; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE hr.training_completions (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    assignment_id bigint NOT NULL,
    user_name text,
    progress_percent integer,
    completed_on timestamp with time zone,
    last_position_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE hr.training_completions OWNER TO postgres;

--
-- TOC entry 260 (class 1259 OID 16594)
-- Name: training_completions_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.training_completions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.training_completions_id_seq OWNER TO postgres;

--
-- TOC entry 3860 (class 0 OID 0)
-- Dependencies: 260
-- Name: training_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.training_completions_id_seq OWNED BY hr.training_completions.id;


--
-- TOC entry 261 (class 1259 OID 16595)
-- Name: training_id_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

CREATE SEQUENCE hr.training_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE hr.training_id_seq OWNER TO postgres;

--
-- TOC entry 3861 (class 0 OID 0)
-- Dependencies: 261
-- Name: training_id_seq; Type: SEQUENCE OWNED BY; Schema: hr; Owner: postgres
--

ALTER SEQUENCE hr.training_id_seq OWNED BY hr.training.id;


--
-- TOC entry 262 (class 1259 OID 16596)
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    manager_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    department_type text DEFAULT 'Program'::text
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- TOC entry 291 (class 1259 OID 24611)
-- Name: email_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_settings (
    id bigint NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    provider text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_settings_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'outlook'::text])))
);


ALTER TABLE public.email_settings OWNER TO postgres;

--
-- TOC entry 290 (class 1259 OID 24610)
-- Name: email_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.email_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.email_settings_id_seq OWNER TO postgres;

--
-- TOC entry 3862 (class 0 OID 0)
-- Dependencies: 290
-- Name: email_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.email_settings_id_seq OWNED BY public.email_settings.id;


--
-- TOC entry 263 (class 1259 OID 16603)
-- Name: organizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.organizations OWNER TO postgres;

--
-- TOC entry 264 (class 1259 OID 16610)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role character varying(20) DEFAULT 'USER'::character varying,
    department_id uuid
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 265 (class 1259 OID 16619)
-- Name: survey_assignments_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.survey_assignments_view AS
 SELECT sa.id,
    sa.organization_id,
    sa.title,
    sa.survey_id,
    sa.due_date,
    sa.status,
    sa.created_at,
    sa.user_id,
    sa.department_id,
    sa.all_staff,
    ((u.first_name || ' '::text) || u.last_name) AS user_name,
    d.name AS department_name
   FROM ((hr.survey_assignments sa
     LEFT JOIN public.users u ON ((u.id = sa.user_id)))
     LEFT JOIN public.departments d ON ((d.id = sa.department_id)));


ALTER VIEW public.survey_assignments_view OWNER TO postgres;

--
-- TOC entry 266 (class 1259 OID 16624)
-- Name: user_app_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_app_access (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    app text NOT NULL
);


ALTER TABLE public.user_app_access OWNER TO postgres;

--
-- TOC entry 267 (class 1259 OID 16629)
-- Name: user_app_access_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_app_access_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_app_access_id_seq OWNER TO postgres;

--
-- TOC entry 3863 (class 0 OID 0)
-- Dependencies: 267
-- Name: user_app_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_app_access_id_seq OWNED BY public.user_app_access.id;


--
-- TOC entry 268 (class 1259 OID 16630)
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- TOC entry 269 (class 1259 OID 16635)
-- Name: user_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_roles_id_seq OWNER TO postgres;

--
-- TOC entry 3864 (class 0 OID 0)
-- Dependencies: 269
-- Name: user_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_roles_id_seq OWNED BY public.user_roles.id;


--
-- TOC entry 270 (class 1259 OID 16636)
-- Name: emergency_contacts; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.emergency_contacts (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    relation text,
    phone text,
    employee_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.emergency_contacts OWNER TO postgres;

--
-- TOC entry 271 (class 1259 OID 16642)
-- Name: emergency_contacts_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.emergency_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.emergency_contacts_id_seq OWNER TO postgres;

--
-- TOC entry 3865 (class 0 OID 0)
-- Dependencies: 271
-- Name: emergency_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.emergency_contacts_id_seq OWNED BY ursafe.emergency_contacts.id;


--
-- TOC entry 272 (class 1259 OID 16643)
-- Name: mileage; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.mileage (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    trip_date date,
    employee_name text,
    vehicle_id text,
    distance_km numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.mileage OWNER TO postgres;

--
-- TOC entry 273 (class 1259 OID 16649)
-- Name: mileage_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.mileage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.mileage_id_seq OWNER TO postgres;

--
-- TOC entry 3866 (class 0 OID 0)
-- Dependencies: 273
-- Name: mileage_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.mileage_id_seq OWNED BY ursafe.mileage.id;


--
-- TOC entry 274 (class 1259 OID 16650)
-- Name: safety_checklists; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.safety_checklists (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    location text,
    completed_by text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.safety_checklists OWNER TO postgres;

--
-- TOC entry 275 (class 1259 OID 16656)
-- Name: safety_checklists_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.safety_checklists_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.safety_checklists_id_seq OWNER TO postgres;

--
-- TOC entry 3867 (class 0 OID 0)
-- Dependencies: 275
-- Name: safety_checklists_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.safety_checklists_id_seq OWNED BY ursafe.safety_checklists.id;


--
-- TOC entry 276 (class 1259 OID 16657)
-- Name: ursafe_active_sessions; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.ursafe_active_sessions (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'online'::text NOT NULL,
    device_name text,
    platform text,
    started_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    location jsonb,
    last_known_activity text,
    battery_level integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.ursafe_active_sessions OWNER TO postgres;

--
-- TOC entry 277 (class 1259 OID 16664)
-- Name: ursafe_active_sessions_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.ursafe_active_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.ursafe_active_sessions_id_seq OWNER TO postgres;

--
-- TOC entry 3868 (class 0 OID 0)
-- Dependencies: 277
-- Name: ursafe_active_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.ursafe_active_sessions_id_seq OWNED BY ursafe.ursafe_active_sessions.id;


--
-- TOC entry 278 (class 1259 OID 16665)
-- Name: ursafe_check_ins; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.ursafe_check_ins (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    shift_id bigint NOT NULL,
    user_id uuid NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    location jsonb,
    status text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.ursafe_check_ins OWNER TO postgres;

--
-- TOC entry 279 (class 1259 OID 16671)
-- Name: ursafe_check_ins_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.ursafe_check_ins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.ursafe_check_ins_id_seq OWNER TO postgres;

--
-- TOC entry 3869 (class 0 OID 0)
-- Dependencies: 279
-- Name: ursafe_check_ins_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.ursafe_check_ins_id_seq OWNED BY ursafe.ursafe_check_ins.id;


--
-- TOC entry 280 (class 1259 OID 16672)
-- Name: ursafe_emergencies; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.ursafe_emergencies (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    shift_id bigint,
    type text NOT NULL,
    location jsonb,
    "timestamp" timestamp with time zone NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.ursafe_emergencies OWNER TO postgres;

--
-- TOC entry 281 (class 1259 OID 16679)
-- Name: ursafe_emergencies_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.ursafe_emergencies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.ursafe_emergencies_id_seq OWNER TO postgres;

--
-- TOC entry 3870 (class 0 OID 0)
-- Dependencies: 281
-- Name: ursafe_emergencies_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.ursafe_emergencies_id_seq OWNED BY ursafe.ursafe_emergencies.id;


--
-- TOC entry 282 (class 1259 OID 16680)
-- Name: ursafe_shifts; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.ursafe_shifts (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    last_check_in timestamp with time zone,
    check_in_count integer DEFAULT 0 NOT NULL,
    start_location jsonb,
    end_location jsonb,
    current_location jsonb,
    client_name text,
    client_address text,
    expected_duration integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.ursafe_shifts OWNER TO postgres;

--
-- TOC entry 283 (class 1259 OID 16689)
-- Name: ursafe_shifts_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.ursafe_shifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.ursafe_shifts_id_seq OWNER TO postgres;

--
-- TOC entry 3871 (class 0 OID 0)
-- Dependencies: 283
-- Name: ursafe_shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.ursafe_shifts_id_seq OWNED BY ursafe.ursafe_shifts.id;


--
-- TOC entry 284 (class 1259 OID 16690)
-- Name: ursafe_trips; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.ursafe_trips (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    category text NOT NULL,
    start_location jsonb,
    end_location jsonb,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    distance_miles numeric(10,2) DEFAULT 0 NOT NULL,
    route jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    vehicle_info text,
    purpose text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.ursafe_trips OWNER TO postgres;

--
-- TOC entry 285 (class 1259 OID 16700)
-- Name: ursafe_trips_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.ursafe_trips_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.ursafe_trips_id_seq OWNER TO postgres;

--
-- TOC entry 3872 (class 0 OID 0)
-- Dependencies: 285
-- Name: ursafe_trips_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.ursafe_trips_id_seq OWNED BY ursafe.ursafe_trips.id;


--
-- TOC entry 286 (class 1259 OID 16701)
-- Name: ursafe_user_profiles; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.ursafe_user_profiles (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    department text,
    manager_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    phone_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.ursafe_user_profiles OWNER TO postgres;

--
-- TOC entry 287 (class 1259 OID 16709)
-- Name: ursafe_user_profiles_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.ursafe_user_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.ursafe_user_profiles_id_seq OWNER TO postgres;

--
-- TOC entry 3873 (class 0 OID 0)
-- Dependencies: 287
-- Name: ursafe_user_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.ursafe_user_profiles_id_seq OWNED BY ursafe.ursafe_user_profiles.id;


--
-- TOC entry 288 (class 1259 OID 16710)
-- Name: vehicles; Type: TABLE; Schema: ursafe; Owner: postgres
--

CREATE TABLE ursafe.vehicles (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    plate_number text,
    status text,
    assigned_location text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE ursafe.vehicles OWNER TO postgres;

--
-- TOC entry 289 (class 1259 OID 16716)
-- Name: vehicles_id_seq; Type: SEQUENCE; Schema: ursafe; Owner: postgres
--

CREATE SEQUENCE ursafe.vehicles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE ursafe.vehicles_id_seq OWNER TO postgres;

--
-- TOC entry 3874 (class 0 OID 0)
-- Dependencies: 289
-- Name: vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: ursafe; Owner: postgres
--

ALTER SEQUENCE ursafe.vehicles_id_seq OWNED BY ursafe.vehicles.id;


--
-- TOC entry 3494 (class 2604 OID 16717)
-- Name: clients id; Type: DEFAULT; Schema: care; Owner: postgres
--

ALTER TABLE ONLY care.clients ALTER COLUMN id SET DEFAULT nextval('care.clients_id_seq'::regclass);


--
-- TOC entry 3496 (class 2604 OID 16718)
-- Name: incidents id; Type: DEFAULT; Schema: care; Owner: postgres
--

ALTER TABLE ONLY care.incidents ALTER COLUMN id SET DEFAULT nextval('care.incidents_id_seq'::regclass);


--
-- TOC entry 3498 (class 2604 OID 16719)
-- Name: notes id; Type: DEFAULT; Schema: care; Owner: postgres
--

ALTER TABLE ONLY care.notes ALTER COLUMN id SET DEFAULT nextval('care.notes_id_seq'::regclass);


--
-- TOC entry 3500 (class 2604 OID 16720)
-- Name: staff id; Type: DEFAULT; Schema: care; Owner: postgres
--

ALTER TABLE ONLY care.staff ALTER COLUMN id SET DEFAULT nextval('care.staff_id_seq'::regclass);


--
-- TOC entry 3502 (class 2604 OID 16721)
-- Name: announcements id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.announcements ALTER COLUMN id SET DEFAULT nextval('hr.announcements_id_seq'::regclass);


--
-- TOC entry 3504 (class 2604 OID 16722)
-- Name: document_assignments id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.document_assignments ALTER COLUMN id SET DEFAULT nextval('hr.document_assignments_id_seq'::regclass);


--
-- TOC entry 3507 (class 2604 OID 16723)
-- Name: document_signatures id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.document_signatures ALTER COLUMN id SET DEFAULT nextval('hr.document_signatures_id_seq'::regclass);


--
-- TOC entry 3509 (class 2604 OID 16724)
-- Name: documents id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.documents ALTER COLUMN id SET DEFAULT nextval('hr.documents_id_seq'::regclass);


--
-- TOC entry 3589 (class 2604 OID 24632)
-- Name: email_settings id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.email_settings ALTER COLUMN id SET DEFAULT nextval('hr.email_settings_id_seq'::regclass);


--
-- TOC entry 3514 (class 2604 OID 16725)
-- Name: employees id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.employees ALTER COLUMN id SET DEFAULT nextval('hr.employees_id_seq'::regclass);


--
-- TOC entry 3516 (class 2604 OID 16726)
-- Name: hr_onboarding_expiry_tasks id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.hr_onboarding_expiry_tasks ALTER COLUMN id SET DEFAULT nextval('hr.hr_onboarding_expiry_tasks_id_seq'::regclass);


--
-- TOC entry 3518 (class 2604 OID 16727)
-- Name: hr_onboarding_uploads id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.hr_onboarding_uploads ALTER COLUMN id SET DEFAULT nextval('hr.hr_onboarding_uploads_id_seq'::regclass);


--
-- TOC entry 3520 (class 2604 OID 16728)
-- Name: hr_user_roles id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.hr_user_roles ALTER COLUMN id SET DEFAULT nextval('hr.hr_user_roles_id_seq'::regclass);


--
-- TOC entry 3522 (class 2604 OID 16729)
-- Name: survey_assignments id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.survey_assignments ALTER COLUMN id SET DEFAULT nextval('hr.survey_assignments_id_seq'::regclass);


--
-- TOC entry 3525 (class 2604 OID 16730)
-- Name: survey_completions id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.survey_completions ALTER COLUMN id SET DEFAULT nextval('hr.survey_completions_id_seq'::regclass);


--
-- TOC entry 3527 (class 2604 OID 16731)
-- Name: surveys id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.surveys ALTER COLUMN id SET DEFAULT nextval('hr.surveys_id_seq'::regclass);


--
-- TOC entry 3529 (class 2604 OID 16732)
-- Name: task_assignments id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.task_assignments ALTER COLUMN id SET DEFAULT nextval('hr.task_assignments_id_seq'::regclass);


--
-- TOC entry 3531 (class 2604 OID 16733)
-- Name: task_completion id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.task_completion ALTER COLUMN id SET DEFAULT nextval('hr.task_completion_id_seq'::regclass);


--
-- TOC entry 3533 (class 2604 OID 16734)
-- Name: task_user_states id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.task_user_states ALTER COLUMN id SET DEFAULT nextval('hr.task_user_states_id_seq'::regclass);


--
-- TOC entry 3535 (class 2604 OID 16735)
-- Name: tasks id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.tasks ALTER COLUMN id SET DEFAULT nextval('hr.tasks_id_seq'::regclass);


--
-- TOC entry 3538 (class 2604 OID 16736)
-- Name: training id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.training ALTER COLUMN id SET DEFAULT nextval('hr.training_id_seq'::regclass);


--
-- TOC entry 3540 (class 2604 OID 16737)
-- Name: training_assignments id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.training_assignments ALTER COLUMN id SET DEFAULT nextval('hr.training_assignments_id_seq'::regclass);


--
-- TOC entry 3542 (class 2604 OID 16738)
-- Name: training_completions id; Type: DEFAULT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.training_completions ALTER COLUMN id SET DEFAULT nextval('hr.training_completions_id_seq'::regclass);


--
-- TOC entry 3586 (class 2604 OID 24614)
-- Name: email_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_settings ALTER COLUMN id SET DEFAULT nextval('public.email_settings_id_seq'::regclass);


--
-- TOC entry 3553 (class 2604 OID 16739)
-- Name: user_app_access id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_app_access ALTER COLUMN id SET DEFAULT nextval('public.user_app_access_id_seq'::regclass);


--
-- TOC entry 3554 (class 2604 OID 16740)
-- Name: user_roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles ALTER COLUMN id SET DEFAULT nextval('public.user_roles_id_seq'::regclass);


--
-- TOC entry 3555 (class 2604 OID 16741)
-- Name: emergency_contacts id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.emergency_contacts ALTER COLUMN id SET DEFAULT nextval('ursafe.emergency_contacts_id_seq'::regclass);


--
-- TOC entry 3557 (class 2604 OID 16742)
-- Name: mileage id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.mileage ALTER COLUMN id SET DEFAULT nextval('ursafe.mileage_id_seq'::regclass);


--
-- TOC entry 3559 (class 2604 OID 16743)
-- Name: safety_checklists id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.safety_checklists ALTER COLUMN id SET DEFAULT nextval('ursafe.safety_checklists_id_seq'::regclass);


--
-- TOC entry 3561 (class 2604 OID 16744)
-- Name: ursafe_active_sessions id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.ursafe_active_sessions ALTER COLUMN id SET DEFAULT nextval('ursafe.ursafe_active_sessions_id_seq'::regclass);


--
-- TOC entry 3564 (class 2604 OID 16745)
-- Name: ursafe_check_ins id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.ursafe_check_ins ALTER COLUMN id SET DEFAULT nextval('ursafe.ursafe_check_ins_id_seq'::regclass);


--
-- TOC entry 3566 (class 2604 OID 16746)
-- Name: ursafe_emergencies id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.ursafe_emergencies ALTER COLUMN id SET DEFAULT nextval('ursafe.ursafe_emergencies_id_seq'::regclass);


--
-- TOC entry 3569 (class 2604 OID 16747)
-- Name: ursafe_shifts id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.ursafe_shifts ALTER COLUMN id SET DEFAULT nextval('ursafe.ursafe_shifts_id_seq'::regclass);


--
-- TOC entry 3574 (class 2604 OID 16748)
-- Name: ursafe_trips id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.ursafe_trips ALTER COLUMN id SET DEFAULT nextval('ursafe.ursafe_trips_id_seq'::regclass);


--
-- TOC entry 3580 (class 2604 OID 16749)
-- Name: ursafe_user_profiles id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.ursafe_user_profiles ALTER COLUMN id SET DEFAULT nextval('ursafe.ursafe_user_profiles_id_seq'::regclass);


--
-- TOC entry 3584 (class 2604 OID 16750)
-- Name: vehicles id; Type: DEFAULT; Schema: ursafe; Owner: postgres
--

ALTER TABLE ONLY ursafe.vehicles ALTER COLUMN id SET DEFAULT nextval('ursafe.vehicles_id_seq'::regclass);


--
-- TOC entry 3757 (class 0 OID 16439)
-- Dependencies: 218
-- Data for Name: clients; Type: TABLE DATA; Schema: care; Owner: postgres
--

COPY care.clients (id, organization_id, full_name, status, program, primary_contact, created_at) FROM stdin;
\.


--
-- TOC entry 3759 (class 0 OID 16446)
-- Dependencies: 220
-- Data for Name: incidents; Type: TABLE DATA; Schema: care; Owner: postgres
--

COPY care.incidents (id, organization_id, title, severity, reported_by, status, created_at) FROM stdin;
\.


--
-- TOC entry 3761 (class 0 OID 16453)
-- Dependencies: 222
-- Data for Name: notes; Type: TABLE DATA; Schema: care; Owner: postgres
--

COPY care.notes (id, organization_id, client_id, staff_id, note_text, visibility, created_at) FROM stdin;
\.


--
-- TOC entry 3763 (class 0 OID 16460)
-- Dependencies: 224
-- Data for Name: staff; Type: TABLE DATA; Schema: care; Owner: postgres
--

COPY care.staff (id, organization_id, full_name, role, email, phone, created_at) FROM stdin;
\.


--
-- TOC entry 3765 (class 0 OID 16467)
-- Dependencies: 226
-- Data for Name: announcements; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.announcements (id, organization_id, title, body, audience, publish_date, start_date, end_date, priority, status, created_at) FROM stdin;
\.


--
-- TOC entry 3767 (class 0 OID 16474)
-- Dependencies: 228
-- Data for Name: document_assignments; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.document_assignments (id, organization_id, document_id, user_id, department_id, all_staff, created_at) FROM stdin;
14	11111111-1111-1111-1111-111111111111	1	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	f	2026-04-23 21:34:19.60802+00
\.


--
-- TOC entry 3769 (class 0 OID 16480)
-- Dependencies: 230
-- Data for Name: document_signatures; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.document_signatures (id, organization_id, document_id, signer_name, status, signed_at, note, created_at, user_id) FROM stdin;
1	11111111-1111-1111-1111-111111111111	1	Jorden Lee	Signed	2026-04-23 21:43:16.331016+00	{"signatureData":"data:image/png;base64,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","signatureId":"9151931b-71ca-4ba3-8ddb-501b4330decb","signedAt":"2026-04-23T21:43:16.123Z","signedBy":"Jorden Lee","assignedBy":"Platform Admin","fileUrl":"http://192.168.1.156:8080/uploads/signed/Jorden-Lee/signed-1-94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8-1776980596316.pdf"}	2026-04-23 21:43:16.331016+00	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8
\.


--
-- TOC entry 3771 (class 0 OID 16487)
-- Dependencies: 232
-- Data for Name: documents; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.documents (id, organization_id, title, category, owner_name, storage_path, due_date, requires_signature, status, created_at, file_name, file_url, category_other, department_id, description, sensitive, created_by, allow_download) FROM stdin;
1	11111111-1111-1111-1111-111111111111	Ismail's Visa Netflix $31.48 02-26-2026.pdf	Policy	\N	\N	2026-04-25	t	Archived	2026-04-23 17:03:07.604771+00	Ismail's Visa Netflix $31.48 02-26-2026.pdf	http://192.168.1.156:8080/uploads/original/original-1-1776963787607.pdf	\N	\N	test	t	22222222-2222-2222-2222-222222222222	f
\.


--
-- TOC entry 3831 (class 0 OID 24629)
-- Dependencies: 293
-- Data for Name: email_settings; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.email_settings (id, email, password, provider, created_at, updated_at) FROM stdin;
1	iismaili@vdacl.ca	9e5cd7da993ece624698bb38b6bd4887:7910fd11e042be066c79ec8f31f9a38b	outlook	2026-04-24 15:57:48.067916+00	2026-04-24 18:35:23.906115+00
\.


--
-- TOC entry 3773 (class 0 OID 16497)
-- Dependencies: 234
-- Data for Name: employees; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.employees (id, organization_id, full_name, department, job_title, email, created_at) FROM stdin;
\.


--
-- TOC entry 3775 (class 0 OID 16504)
-- Dependencies: 236
-- Data for Name: hr_onboarding_expiry_tasks; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.hr_onboarding_expiry_tasks (id, organization_id, user_id, document_type_key, expiry_date, task_id, created_at) FROM stdin;
1	11111111-1111-1111-1111-111111111111	22222222-2222-2222-2222-222222222222	mandt certificate	2026-04-24	1	2026-04-23 16:09:45.34756+00
2	11111111-1111-1111-1111-111111111111	22222222-2222-2222-2222-222222222222	first aid	2026-04-30	4	2026-04-23 17:47:10.9966+00
3	11111111-1111-1111-1111-111111111111	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	driver's license (front and back)	2026-04-30	5	2026-04-24 15:13:38.934532+00
\.


--
-- TOC entry 3777 (class 0 OID 16511)
-- Dependencies: 238
-- Data for Name: hr_onboarding_uploads; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.hr_onboarding_uploads (id, organization_id, user_id, stored_file_name, original_file_name, document_type, file_url, expiry_date, uploaded_at) FROM stdin;
3	11111111-1111-1111-1111-111111111111	22222222-2222-2222-2222-222222222222	First-Aid_1776966430962.pdf	Ismail's Visa Netflix $33.58 03-17-2026.pdf	First Aid	http://192.168.1.156:8080/uploads/onboarding/Platform-Admin-22222222-2222-2222-2222-222222222222/First-Aid_1776966430962.pdf	2027-04-30	2026-04-23 17:47:10.99292+00
4	11111111-1111-1111-1111-111111111111	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	Driver-s-License-Front-and-Back_1777043618906.jpg	Screenshot 2026-04-22 081729.jpg	Driver's License (Front and Back)	http://192.168.1.156:8080/uploads/onboarding/Jorden-Lee-94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8/Driver-s-License-Front-and-Back_1777043618906.jpg	2026-12-15	2026-04-24 15:13:38.926141+00
\.


--
-- TOC entry 3779 (class 0 OID 16518)
-- Dependencies: 240
-- Data for Name: hr_user_roles; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.hr_user_roles (id, organization_id, user_id, role, department_id, manager_id, created_at, department) FROM stdin;
1	11111111-1111-1111-1111-111111111111	22222222-2222-2222-2222-222222222222	admin	\N	\N	2026-04-23 16:14:13.142039+00	\N
2	11111111-1111-1111-1111-111111111111	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	employee	a9461136-ffd8-4ae1-9f6a-3b1142e13185	\N	2026-04-23 17:01:52.068462+00	\N
3	11111111-1111-1111-1111-111111111111	a9461136-ffd8-4ae1-9f6a-3b1142e13185	manager	22222222-2222-2222-2222-222222222222	\N	2026-04-23 17:02:11.814289+00	\N
\.


--
-- TOC entry 3781 (class 0 OID 16526)
-- Dependencies: 242
-- Data for Name: survey_assignments; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.survey_assignments (id, organization_id, title, survey_id, due_date, status, created_at, user_id, department_id, all_staff) FROM stdin;
1	11111111-1111-1111-1111-111111111111	Employee of the Month Nomination	1	2026-04-30	Archived	2026-04-23 17:51:25.174276+00	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	f
2	11111111-1111-1111-1111-111111111111	Employee of the Month Nomination	1	2026-04-30	Archived	2026-04-23 21:36:28.44133+00	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	f
\.


--
-- TOC entry 3783 (class 0 OID 16534)
-- Dependencies: 244
-- Data for Name: survey_completions; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.survey_completions (id, organization_id, assignment_id, completed_on, created_at, user_id) FROM stdin;
1	11111111-1111-1111-1111-111111111111	1	2026-04-23 17:52:43.195+00	2026-04-23 17:52:43.199994+00	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8
2	11111111-1111-1111-1111-111111111111	2	2026-04-23 21:52:44.295+00	2026-04-23 21:52:44.312077+00	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8
\.


--
-- TOC entry 3785 (class 0 OID 16539)
-- Dependencies: 246
-- Data for Name: surveys; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.surveys (id, organization_id, title, url, due_date, status, created_at, created_by) FROM stdin;
1	11111111-1111-1111-1111-111111111111	Employee of the Month Nomination	<iframe width="640px" height="480px" src="https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=v8bBdqJDN0OhsmgLBnTRdnOcmGFmEOJLlrRSfmNhymhUM1I4MlBTUklJWkFDWkU5MzNINDVVWUVOOS4u&embed=true" frameborder="0" marginwidth="0" marginheight="0" style="border: none; max-width:100%; max-height:100vh" allowfullscreen webkitallowfullscreen mozallowfullscreen msallowfullscreen> </iframe>	\N	Active	2026-04-23 17:51:12.327453+00	22222222-2222-2222-2222-222222222222
\.


--
-- TOC entry 3787 (class 0 OID 16546)
-- Dependencies: 248
-- Data for Name: task_assignments; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.task_assignments (id, task_id, user_id, department, assigned_at) FROM stdin;
1	1	22222222-2222-2222-2222-222222222222		2026-04-23 16:09:45.393
2	2	a9461136-ffd8-4ae1-9f6a-3b1142e13185	\N	2026-04-23 17:20:26.583
3	3	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-23 17:22:12.279
4	4	22222222-2222-2222-2222-222222222222		2026-04-23 17:47:11.005
5	5	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8		2026-04-24 15:13:38.952
6	6	22222222-2222-2222-2222-222222222222	\N	2026-04-24 15:48:45.692
8	7	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-24 16:32:52.44
9	8	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-24 16:33:32.655
10	9	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-24 16:37:22.988
11	10	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-24 16:47:52.963
12	11	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-24 16:58:57.085
13	12	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-24 18:05:19.666
14	13	22222222-2222-2222-2222-222222222222	\N	2026-04-24 18:56:21.624
16	14	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-25 01:36:46.823
17	15	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	\N	2026-04-25 01:41:32.522
\.


--
-- TOC entry 3789 (class 0 OID 16553)
-- Dependencies: 250
-- Data for Name: task_completion; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.task_completion (id, task_id, user_id, completed_at, status, started_at) FROM stdin;
1	1	22222222-2222-2222-2222-222222222222	2026-04-23 16:59:17.647	COMPLETED	2026-04-23 23:59:12.236
2	3	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	2026-04-23 17:22:55.255	COMPLETED	2026-04-24 00:22:36.142
3	2	a9461136-ffd8-4ae1-9f6a-3b1142e13185	2026-04-23 17:23:06.863	COMPLETED	2026-04-24 00:23:02.594
4	4	22222222-2222-2222-2222-222222222222	2026-04-23 17:47:55.558	COMPLETED	2026-04-23 17:47:54.418
5	12	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	2026-04-24 18:07:11.139	COMPLETED	2026-04-25 01:07:04.419
\.


--
-- TOC entry 3791 (class 0 OID 16560)
-- Dependencies: 252
-- Data for Name: task_user_states; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.task_user_states (id, organization_id, task_id, user_name, status, completed_on, created_at) FROM stdin;
\.


--
-- TOC entry 3793 (class 0 OID 16567)
-- Dependencies: 254
-- Data for Name: tasks; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.tasks (id, organization_id, title, assigned_to, due_date, status, priority, description, created_at, archived) FROM stdin;
1	11111111-1111-1111-1111-111111111111	Mandt Certificate is expiring on 04/24/2026	Platform Admin	2026-04-24	Completed	High	This onboarding document is expiring soon and must be renewed.\nDocument type: Mandt Certificate\nOriginal file name: Ismail's Visa Netflix $26.87 03-05-2026.pdf\nStored file name: Mandt-Certificate_1776960585305.pdf\nFile link: http://192.168.1.156:8080/uploads/onboarding/Platform-Admin-22222222-2222-2222-2222-222222222222/Mandt-Certificate_1776960585305.pdf\nUploaded at: 2026-04-23 16:09:45.334339+00\nExpiry date: 04/24/2026\nAction: Retake this document/certification and upload the updated file before expiry.	2026-04-23 16:09:45.34756+00	t
3	11111111-1111-1111-1111-111111111111	Employee Test	Jorden Lee	2026-04-30	Not Started	Normal	Teeeeeeeeeeeeeeeeeeessssssssssssssssssssssst	2026-04-23 17:22:12.268982+00	t
2	11111111-1111-1111-1111-111111111111	Manager Test	Megan Casey	2026-04-30	Not Started	Normal		2026-04-23 17:20:26.572552+00	t
12	11111111-1111-1111-1111-111111111111	Test Email	Jorden Lee	2026-04-30	Not Started	Normal	gfdsfsdafdsafdsaf	2026-04-24 18:05:19.655247+00	t
4	11111111-1111-1111-1111-111111111111	First Aid is expiring on 04/30/2026	Platform Admin	2026-04-30	Completed	High	This onboarding document is expiring soon and must be renewed.\nDocument type: First Aid\nOriginal file name: Ismail's Visa Netflix $33.58 03-17-2026.pdf\nStored file name: First-Aid_1776966430962.pdf\nFile link: http://192.168.1.156:8080/uploads/onboarding/Platform-Admin-22222222-2222-2222-2222-222222222222/First-Aid_1776966430962.pdf\nUploaded at: 2026-04-23 17:47:10.99292+00\nExpiry date: 04/30/2026\nAction: Retake this document/certification and upload the updated file before expiry.	2026-04-23 17:47:10.9966+00	t
15	11111111-1111-1111-1111-111111111111	Test this 	Jorden Lee	2026-04-30	Not Started	Normal		2026-04-25 01:41:32.510515+00	f
\.


--
-- TOC entry 3795 (class 0 OID 16575)
-- Dependencies: 256
-- Data for Name: training; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.training (id, organization_id, training_name, audience, delivery_mode, video_iframe_link, status, created_at, quiz_iframe_link) FROM stdin;
1	11111111-1111-1111-1111-111111111111	Creating a Respectful Workplace Training	\N	\N	<iframe src="https://vdacl.sharepoint.com/sites/hr/_layouts/15/embed.aspx?UniqueId=7b74eb76-e753-4a16-a3a1-d8ac13ea5e6b&embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create" width="1520" height="720" frameborder="0" scrolling="no" allowfullscreen title="Creating a Respectful Workplace Training.mp4"></iframe>	Active	2026-04-23 17:49:26.839062+00	<iframe width="1520px" height="1200px" src="https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=v8bBdqJDN0OhsmgLBnTRduxyLiahRjxPuJR2oqH-GkxUMDZQUk5CWVJKUUo2SUFER0E3MUIwMkwwSi4u&embed=true" frameborder="0" marginwidth="0" marginheight="0" style="border: none; max-width:100%; max-height:100vh" allowfullscreen webkitallowfullscreen mozallowfullscreen msallowfullscreen> </iframe>
\.


--
-- TOC entry 3796 (class 0 OID 16581)
-- Dependencies: 257
-- Data for Name: training_assignments; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.training_assignments (id, organization_id, title, training_id, assignee_name, due_date, survey_url, status, created_at) FROM stdin;
1	11111111-1111-1111-1111-111111111111	Creating a Respectful Workplace Training	1	Jorden Lee	2026-04-30	<iframe width="640px" height="480px" src="https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=v8bBdqJDN0OhsmgLBnTRduxyLiahRjxPuJR2oqH-GkxUMDZQUk5CWVJKUUo2SUFER0E3MUIwMkwwSi4u&embed=true" frameborder="0" marginwidth="0" marginheight="0" style="border: none; max-width:100%; max-height:100vh" allowfullscreen webkitallowfullscreen mozallowfullscreen msallowfullscreen> </iframe>	Archived	2026-04-23 17:50:00.805968+00
\.


--
-- TOC entry 3798 (class 0 OID 16588)
-- Dependencies: 259
-- Data for Name: training_completions; Type: TABLE DATA; Schema: hr; Owner: postgres
--

COPY hr.training_completions (id, organization_id, assignment_id, user_name, progress_percent, completed_on, last_position_seconds, created_at) FROM stdin;
1	11111111-1111-1111-1111-111111111111	1	Jorden Lee	100	2026-04-23 21:52:33.873+00	0	2026-04-23 21:52:33.890369+00
\.


--
-- TOC entry 3801 (class 0 OID 16596)
-- Dependencies: 262
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (id, organization_id, name, address, manager_id, created_at, department_type) FROM stdin;
b1f7452f-9011-4296-953b-4a02eb5b13cd	11111111-1111-1111-1111-111111111111	Administration	4240 Alexis Park Dr. Vernon BC V1T 6H3	\N	2026-04-23 16:35:34.134722+00	Program
112488d4-9097-4b35-9c65-19ffd8f1d691	11111111-1111-1111-1111-111111111111	Community Inclusion	4240 Alexis Park Dr. Vernon BC V1T 6H3	\N	2026-04-23 16:37:01.556272+00	Program
\.


--
-- TOC entry 3829 (class 0 OID 24611)
-- Dependencies: 291
-- Data for Name: email_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_settings (id, email, password, provider, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3802 (class 0 OID 16603)
-- Dependencies: 263
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organizations (id, name, created_at) FROM stdin;
11111111-1111-1111-1111-111111111111	VLWorkHub Seed Org	2026-04-23 16:03:46.784139+00
\.


--
-- TOC entry 3804 (class 0 OID 16624)
-- Dependencies: 266
-- Data for Name: user_app_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_app_access (id, user_id, app) FROM stdin;
1	22222222-2222-2222-2222-222222222222	HR
2	22222222-2222-2222-2222-222222222222	CARE
3	22222222-2222-2222-2222-222222222222	URSAFE
8	a9461136-ffd8-4ae1-9f6a-3b1142e13185	HR
9	a9461136-ffd8-4ae1-9f6a-3b1142e13185	URSAFE
12	94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	HR
\.


--
-- TOC entry 3806 (class 0 OID 16630)
-- Dependencies: 268
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_roles (id, user_id, role) FROM stdin;
1	22222222-2222-2222-2222-222222222222	Admin
\.


--
-- TOC entry 3803 (class 0 OID 16610)
-- Dependencies: 264
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, organization_id, email, password_hash, first_name, last_name, status, created_at, role, department_id) FROM stdin;
22222222-2222-2222-2222-222222222222	11111111-1111-1111-1111-111111111111	admin@vlworkhub.ca	6aea6aafc8c446a25beb3c0f9bc56e4d725d5f94cff65138fb8dd0b3c2d2596a	Platform	Admin	active	2026-04-23 16:03:46.784139+00	SUPER_ADMIN	\N
a9461136-ffd8-4ae1-9f6a-3b1142e13185	11111111-1111-1111-1111-111111111111	manager@vlworkhub.ca	c70d790e160ea5eed3760a7435aee3d829de668197b69608be31e0429db29526	Megan	Casey	active	2026-04-23 16:19:49.492947+00	USER	b1f7452f-9011-4296-953b-4a02eb5b13cd
94f448a6-cde7-4bdb-8f7b-aaf370bf2ba8	11111111-1111-1111-1111-111111111111	it@vdacl.ca	c70d790e160ea5eed3760a7435aee3d829de668197b69608be31e0429db29526	Jorden	Lee	active	2026-04-23 16:21:48.075523+00	USER	b1f7452f-9011-4296-953b-4a02eb5b13cd
\.


--
-- TOC entry 3808 (class 0 OID 16636)
-- Dependencies: 270
-- Data for Name: emergency_contacts; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.emergency_contacts (id, organization_id, full_name, relation, phone, employee_name, created_at) FROM stdin;
\.


--
-- TOC entry 3810 (class 0 OID 16643)
-- Dependencies: 272
-- Data for Name: mileage; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.mileage (id, organization_id, trip_date, employee_name, vehicle_id, distance_km, created_at) FROM stdin;
\.


--
-- TOC entry 3812 (class 0 OID 16650)
-- Dependencies: 274
-- Data for Name: safety_checklists; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.safety_checklists (id, organization_id, title, location, completed_by, status, created_at) FROM stdin;
\.


--
-- TOC entry 3814 (class 0 OID 16657)
-- Dependencies: 276
-- Data for Name: ursafe_active_sessions; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.ursafe_active_sessions (id, organization_id, user_id, status, device_name, platform, started_at, last_seen_at, location, last_known_activity, battery_level, notes, created_at) FROM stdin;
\.


--
-- TOC entry 3816 (class 0 OID 16665)
-- Dependencies: 278
-- Data for Name: ursafe_check_ins; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.ursafe_check_ins (id, organization_id, shift_id, user_id, "timestamp", location, status, notes, created_at) FROM stdin;
\.


--
-- TOC entry 3818 (class 0 OID 16672)
-- Dependencies: 280
-- Data for Name: ursafe_emergencies; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.ursafe_emergencies (id, organization_id, user_id, shift_id, type, location, "timestamp", resolved, resolved_by, resolved_at, notes, created_at) FROM stdin;
\.


--
-- TOC entry 3820 (class 0 OID 16680)
-- Dependencies: 282
-- Data for Name: ursafe_shifts; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.ursafe_shifts (id, organization_id, user_id, start_time, end_time, status, last_check_in, check_in_count, start_location, end_location, current_location, client_name, client_address, expected_duration, notes, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3822 (class 0 OID 16690)
-- Dependencies: 284
-- Data for Name: ursafe_trips; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.ursafe_trips (id, organization_id, user_id, status, category, start_location, end_location, start_time, end_time, distance_miles, route, notes, vehicle_info, purpose, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3824 (class 0 OID 16701)
-- Dependencies: 286
-- Data for Name: ursafe_user_profiles; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.ursafe_user_profiles (id, organization_id, user_id, department, manager_user_id, is_active, must_change_password, phone_number, created_at) FROM stdin;
\.


--
-- TOC entry 3826 (class 0 OID 16710)
-- Dependencies: 288
-- Data for Name: vehicles; Type: TABLE DATA; Schema: ursafe; Owner: postgres
--

COPY ursafe.vehicles (id, organization_id, name, plate_number, status, assigned_location, created_at) FROM stdin;
\.


--
-- TOC entry 3875 (class 0 OID 0)
-- Dependencies: 219
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: care; Owner: postgres
--

SELECT pg_catalog.setval('care.clients_id_seq', 1, false);


--
-- TOC entry 3876 (class 0 OID 0)
-- Dependencies: 221
-- Name: incidents_id_seq; Type: SEQUENCE SET; Schema: care; Owner: postgres
--

SELECT pg_catalog.setval('care.incidents_id_seq', 1, false);


--
-- TOC entry 3877 (class 0 OID 0)
-- Dependencies: 223
-- Name: notes_id_seq; Type: SEQUENCE SET; Schema: care; Owner: postgres
--

SELECT pg_catalog.setval('care.notes_id_seq', 1, false);


--
-- TOC entry 3878 (class 0 OID 0)
-- Dependencies: 225
-- Name: staff_id_seq; Type: SEQUENCE SET; Schema: care; Owner: postgres
--

SELECT pg_catalog.setval('care.staff_id_seq', 1, false);


--
-- TOC entry 3879 (class 0 OID 0)
-- Dependencies: 227
-- Name: announcements_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.announcements_id_seq', 1, false);


--
-- TOC entry 3880 (class 0 OID 0)
-- Dependencies: 229
-- Name: document_assignments_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.document_assignments_id_seq', 15, true);


--
-- TOC entry 3881 (class 0 OID 0)
-- Dependencies: 231
-- Name: document_signatures_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.document_signatures_id_seq', 1, true);


--
-- TOC entry 3882 (class 0 OID 0)
-- Dependencies: 233
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.documents_id_seq', 2, true);


--
-- TOC entry 3883 (class 0 OID 0)
-- Dependencies: 292
-- Name: email_settings_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.email_settings_id_seq', 3, true);


--
-- TOC entry 3884 (class 0 OID 0)
-- Dependencies: 235
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.employees_id_seq', 1, false);


--
-- TOC entry 3885 (class 0 OID 0)
-- Dependencies: 237
-- Name: hr_onboarding_expiry_tasks_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.hr_onboarding_expiry_tasks_id_seq', 3, true);


--
-- TOC entry 3886 (class 0 OID 0)
-- Dependencies: 239
-- Name: hr_onboarding_uploads_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.hr_onboarding_uploads_id_seq', 4, true);


--
-- TOC entry 3887 (class 0 OID 0)
-- Dependencies: 241
-- Name: hr_user_roles_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.hr_user_roles_id_seq', 3, true);


--
-- TOC entry 3888 (class 0 OID 0)
-- Dependencies: 243
-- Name: survey_assignments_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.survey_assignments_id_seq', 3, true);


--
-- TOC entry 3889 (class 0 OID 0)
-- Dependencies: 245
-- Name: survey_completions_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.survey_completions_id_seq', 2, true);


--
-- TOC entry 3890 (class 0 OID 0)
-- Dependencies: 247
-- Name: surveys_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.surveys_id_seq', 1, true);


--
-- TOC entry 3891 (class 0 OID 0)
-- Dependencies: 249
-- Name: task_assignments_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.task_assignments_id_seq', 17, true);


--
-- TOC entry 3892 (class 0 OID 0)
-- Dependencies: 251
-- Name: task_completion_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.task_completion_id_seq', 5, true);


--
-- TOC entry 3893 (class 0 OID 0)
-- Dependencies: 253
-- Name: task_user_states_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.task_user_states_id_seq', 1, false);


--
-- TOC entry 3894 (class 0 OID 0)
-- Dependencies: 255
-- Name: tasks_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.tasks_id_seq', 15, true);


--
-- TOC entry 3895 (class 0 OID 0)
-- Dependencies: 258
-- Name: training_assignments_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.training_assignments_id_seq', 2, true);


--
-- TOC entry 3896 (class 0 OID 0)
-- Dependencies: 260
-- Name: training_completions_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.training_completions_id_seq', 1, true);


--
-- TOC entry 3897 (class 0 OID 0)
-- Dependencies: 261
-- Name: training_id_seq; Type: SEQUENCE SET; Schema: hr; Owner: postgres
--

SELECT pg_catalog.setval('hr.training_id_seq', 1, true);


--
-- TOC entry 3898 (class 0 OID 0)
-- Dependencies: 290
-- Name: email_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.email_settings_id_seq', 1, false);


--
-- TOC entry 3899 (class 0 OID 0)
-- Dependencies: 267
-- Name: user_app_access_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_app_access_id_seq', 12, true);


--
-- TOC entry 3900 (class 0 OID 0)
-- Dependencies: 269
-- Name: user_roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_roles_id_seq', 1, true);


--
-- TOC entry 3901 (class 0 OID 0)
-- Dependencies: 271
-- Name: emergency_contacts_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.emergency_contacts_id_seq', 1, false);


--
-- TOC entry 3902 (class 0 OID 0)
-- Dependencies: 273
-- Name: mileage_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.mileage_id_seq', 1, false);


--
-- TOC entry 3903 (class 0 OID 0)
-- Dependencies: 275
-- Name: safety_checklists_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.safety_checklists_id_seq', 1, false);


--
-- TOC entry 3904 (class 0 OID 0)
-- Dependencies: 277
-- Name: ursafe_active_sessions_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.ursafe_active_sessions_id_seq', 1, false);


--
-- TOC entry 3905 (class 0 OID 0)
-- Dependencies: 279
-- Name: ursafe_check_ins_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.ursafe_check_ins_id_seq', 1, false);


--
-- TOC entry 3906 (class 0 OID 0)
-- Dependencies: 281
-- Name: ursafe_emergencies_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.ursafe_emergencies_id_seq', 1, false);


--
-- TOC entry 3907 (class 0 OID 0)
-- Dependencies: 283
-- Name: ursafe_shifts_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.ursafe_shifts_id_seq', 1, false);


--
-- TOC entry 3908 (class 0 OID 0)
-- Dependencies: 285
-- Name: ursafe_trips_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.ursafe_trips_id_seq', 1, false);


--
-- TOC entry 3909 (class 0 OID 0)
-- Dependencies: 287
-- Name: ursafe_user_profiles_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.ursafe_user_profiles_id_seq', 1, false);


--
-- TOC entry 3910 (class 0 OID 0)
-- Dependencies: 289
-- Name: vehicles_id_seq; Type: SEQUENCE SET; Schema: ursafe; Owner: postgres
--

SELECT pg_catalog.setval('ursafe.vehicles_id_seq', 1, false);


--
-- TOC entry 3612 (class 2606 OID 24639)
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY hr.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3609 (class 2606 OID 24621)
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3613 (class 1259 OID 24640)
-- Name: email_settings_single_row; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX email_settings_single_row ON hr.email_settings USING btree ((true));


--
-- TOC entry 3595 (class 1259 OID 24584)
-- Name: idx_document_assignments_all_staff_unique; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX idx_document_assignments_all_staff_unique ON hr.document_assignments USING btree (document_id) WHERE (all_staff = true);


--
-- TOC entry 3596 (class 1259 OID 24588)
-- Name: idx_document_assignments_department; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_document_assignments_department ON hr.document_assignments USING btree (department_id);


--
-- TOC entry 3597 (class 1259 OID 24583)
-- Name: idx_document_assignments_department_unique; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX idx_document_assignments_department_unique ON hr.document_assignments USING btree (document_id, department_id) WHERE (department_id IS NOT NULL);


--
-- TOC entry 3598 (class 1259 OID 24586)
-- Name: idx_document_assignments_document; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_document_assignments_document ON hr.document_assignments USING btree (document_id);


--
-- TOC entry 3599 (class 1259 OID 24587)
-- Name: idx_document_assignments_user; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_document_assignments_user ON hr.document_assignments USING btree (user_id);


--
-- TOC entry 3600 (class 1259 OID 24582)
-- Name: idx_document_assignments_user_unique; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX idx_document_assignments_user_unique ON hr.document_assignments USING btree (document_id, user_id) WHERE (user_id IS NOT NULL);


--
-- TOC entry 3601 (class 1259 OID 24589)
-- Name: idx_document_signatures_document; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_document_signatures_document ON hr.document_signatures USING btree (document_id);


--
-- TOC entry 3602 (class 1259 OID 24585)
-- Name: idx_document_signatures_unique; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX idx_document_signatures_unique ON hr.document_signatures USING btree (document_id, user_id);


--
-- TOC entry 3603 (class 1259 OID 24590)
-- Name: idx_document_signatures_user; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_document_signatures_user ON hr.document_signatures USING btree (user_id);


--
-- TOC entry 3604 (class 1259 OID 16754)
-- Name: idx_hr_onboarding_expiry_tasks_dedupe; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX idx_hr_onboarding_expiry_tasks_dedupe ON hr.hr_onboarding_expiry_tasks USING btree (organization_id, user_id, document_type_key, expiry_date);


--
-- TOC entry 3605 (class 1259 OID 16755)
-- Name: idx_hr_onboarding_expiry_tasks_task; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_hr_onboarding_expiry_tasks_task ON hr.hr_onboarding_expiry_tasks USING btree (task_id);


--
-- TOC entry 3606 (class 1259 OID 16753)
-- Name: idx_hr_onboarding_uploads_org; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_hr_onboarding_uploads_org ON hr.hr_onboarding_uploads USING btree (organization_id, user_id);


--
-- TOC entry 3607 (class 1259 OID 16752)
-- Name: idx_hr_onboarding_uploads_user; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX idx_hr_onboarding_uploads_user ON hr.hr_onboarding_uploads USING btree (user_id, uploaded_at DESC);


--
-- TOC entry 3610 (class 1259 OID 24622)
-- Name: email_settings_single_row; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX email_settings_single_row ON public.email_settings USING btree ((true));


-- Completed on 2026-04-25 07:43:27

--
-- PostgreSQL database dump complete
--

