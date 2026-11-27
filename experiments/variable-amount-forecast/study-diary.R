# Internal adapter for study-p80.mjs. The Node entry point checks each release's SHA-256 first.
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 2L)
if (args[1] %in% c("longer", "liborius")) {
  release <- new.env(parent = emptyenv())
  load(args[2], envir = release)
  diary <- release$data
}
if (args[1] == "longer") {
  stopifnot(all(c("nr", "days", "study_time", "Testudy", "TEKontroll", "groups") %in% names(diary)))
  columns <- with(diary, data.frame(id = nr, day = days, hours = study_time,
                                    studied = Testudy, quality = TEKontroll, arm = groups))
  evening_fields <- c("TEGA", "TEStress", "TECalm", "TEEnergy")
} else if (args[1] == "gap") {
  # Some CSV records are themselves stored as a single quoted CSV field. Decode that
  # outer layer before parsing columns, including the quoted commas in the subject field.
  records <- readLines(args[2], encoding = "UTF-8", warn = FALSE)
  wrapped <- startsWith(records, '"')
  if (any(wrapped)) {
    outer <- read.csv(text = records[wrapped], header = FALSE, colClasses = "character", fill = FALSE)
    stopifnot(ncol(outer) == 1L)
    records[wrapped] <- outer[[1L]]
  }
  diary <- read.csv(text = records, na.strings = c("", "NA"), fill = FALSE)
  stopifnot(all(c("nr", "day0", "tessh", "Testudy") %in% names(diary)))
  columns <- with(diary, data.frame(id = nr, day = day0 + 1L, hours = tessh,
                                    studied = Testudy, quality = NA_integer_, arm = NA_integer_))
  evening_fields <- c("TEZielE", "TEStress", "TECalm", "TEEnergy")
} else if (args[1] == "liborius") {
  # Study 2's released calendar contains zero time even on blank questionnaires.
  # Apply the author's no-entry rule before accepting zero as observed study time.
  items <- c("control_beliefs", "value_beliefs", "procrastination", "time_use",
             "goal_achiev", "goal_achiev1", "goal_achiev2")
  missing_day <- rowSums(diary[items], na.rm = TRUE) == 0
  columns <- with(diary, data.frame(id = id, day = day + 1L, hours = ifelse(missing_day, NA, time_use),
                                    studied = NA_integer_, quality = NA_integer_, arm = NA_integer_))
} else {
  stop("Unknown diary release")
}

# Only presence of an evening response is used to interpret the rest flag.
columns$evening <- if (args[1] == "liborius") 0L else as.integer(rowSums(!is.na(diary[evening_fields])) > 0L)
write.table(columns, file = stdout(), sep = ",", quote = FALSE, row.names = FALSE, na = "")
