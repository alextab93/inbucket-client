Rails.application.config.filter_parameters += %i[
  token
  password
  password_confirmation
  cookie
  authorization
  secret_key_base
]
