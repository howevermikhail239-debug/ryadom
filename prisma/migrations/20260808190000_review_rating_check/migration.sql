ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range_check" CHECK (rating BETWEEN 1 AND 5);
