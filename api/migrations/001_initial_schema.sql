BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  minimum_goal text CHECK (minimum_goal IS NULL OR char_length(minimum_goal) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT goals_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX goals_user_sort_idx ON goals(user_id, sort_order);

CREATE TABLE habit_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  woop_wish text CHECK (woop_wish IS NULL OR char_length(woop_wish) <= 1000),
  woop_outcome text CHECK (woop_outcome IS NULL OR char_length(woop_outcome) <= 1000),
  woop_obstacle text CHECK (woop_obstacle IS NULL OR char_length(woop_obstacle) <= 1000),
  woop_plan text CHECK (woop_plan IS NULL OR char_length(woop_plan) <= 1000),
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT habit_groups_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX habit_groups_user_sort_idx ON habit_groups(user_id, sort_order);

CREATE TABLE habit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT habit_items_id_user_unique UNIQUE (id, user_id),
  CONSTRAINT habit_items_group_user_fk FOREIGN KEY (group_id, user_id) REFERENCES habit_groups(id, user_id) ON DELETE CASCADE
);

CREATE INDEX habit_items_user_sort_idx ON habit_items(user_id, group_id, sort_order);

CREATE TABLE habit_item_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_item_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  times jsonb NOT NULL DEFAULT '[]'::jsonb,
  days jsonb NOT NULL DEFAULT '[true,true,true,true,true,false,false]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT habit_item_notifications_user_item_unique UNIQUE (user_id, habit_item_id),
  CONSTRAINT habit_item_notifications_item_user_fk FOREIGN KEY (habit_item_id, user_id) REFERENCES habit_items(id, user_id) ON DELETE CASCADE,
  CONSTRAINT habit_item_notifications_times_array CHECK (jsonb_typeof(times) = 'array'),
  CONSTRAINT habit_item_notifications_days_array CHECK (jsonb_typeof(days) = 'array' AND jsonb_array_length(days) = 7)
);

CREATE TABLE goal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL,
  log_date date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  minimum_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT goal_logs_user_date_goal_unique UNIQUE (user_id, log_date, goal_id),
  CONSTRAINT goal_logs_goal_user_fk FOREIGN KEY (goal_id, user_id) REFERENCES goals(id, user_id) ON DELETE CASCADE,
  CONSTRAINT goal_logs_done_count_consistent CHECK (done OR count = 0)
);

CREATE INDEX goal_logs_user_date_idx ON goal_logs(user_id, log_date);

CREATE TABLE habit_item_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_item_id uuid NOT NULL,
  log_date date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT habit_item_logs_user_date_item_unique UNIQUE (user_id, log_date, habit_item_id),
  CONSTRAINT habit_item_logs_item_user_fk FOREIGN KEY (habit_item_id, user_id) REFERENCES habit_items(id, user_id) ON DELETE CASCADE,
  CONSTRAINT habit_item_logs_done_count_consistent CHECK (done OR count = 0)
);

CREATE INDEX habit_item_logs_user_date_idx ON habit_item_logs(user_id, log_date);

CREATE TABLE reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reflection_date date NOT NULL,
  free_text text CHECK (free_text IS NULL OR char_length(free_text) <= 5000),
  want_to_do text CHECK (want_to_do IS NULL OR char_length(want_to_do) <= 5000),
  unconscious_desire text CHECK (unconscious_desire IS NULL OR char_length(unconscious_desire) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT reflections_user_date_unique UNIQUE (user_id, reflection_date)
);

CREATE INDEX reflections_user_date_idx ON reflections(user_id, reflection_date DESC);

CREATE TABLE wish_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT wish_categories_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX wish_categories_user_sort_idx ON wish_categories(user_id, sort_order);

CREATE TABLE wish_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT wish_items_category_user_fk FOREIGN KEY (category_id, user_id) REFERENCES wish_categories(id, user_id) ON DELETE CASCADE
);

CREATE INDEX wish_items_user_sort_idx ON wish_items(user_id, category_id, sort_order);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER goals_touch_updated_at
BEFORE UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER habit_groups_touch_updated_at
BEFORE UPDATE ON habit_groups
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER habit_items_touch_updated_at
BEFORE UPDATE ON habit_items
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER habit_item_notifications_touch_updated_at
BEFORE UPDATE ON habit_item_notifications
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER goal_logs_touch_updated_at
BEFORE UPDATE ON goal_logs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER habit_item_logs_touch_updated_at
BEFORE UPDATE ON habit_item_logs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER reflections_touch_updated_at
BEFORE UPDATE ON reflections
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER wish_categories_touch_updated_at
BEFORE UPDATE ON wish_categories
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER wish_items_touch_updated_at
BEFORE UPDATE ON wish_items
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
