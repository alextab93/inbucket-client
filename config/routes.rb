Rails.application.routes.draw do
  get "up" => "health#show", as: :rails_health_check

  namespace :v1 do
    resource :session, only: %i[show create destroy]
    resources :tags, only: %i[index create update destroy]
    get "email-frame" => "email_frames#show"
    get "inbucket/mailboxes" => "inbucket_mailboxes#index"
    get "inbucket/messages" => "inbucket_messages#index"
    get "inbucket/live/messages" => "inbucket_live_messages#index"
    get "inbucket/monitor/messages" => "inbucket_monitor_messages#index"
    get "inbucket/mailbox" => "inbucket_mailboxes#show"
    delete "inbucket/mailbox" => "inbucket_mailboxes#destroy"
    patch "inbucket/mailbox/archive" => "inbucket_mailboxes#archive"
    delete "inbucket/message" => "inbucket_messages#destroy"
    get "inbucket/mailboxes/:name" => "inbucket_mailboxes#show"
    get "inbucket/mailboxes/:name/messages/:id" => "inbucket_messages#show"
    patch "inbucket/mailboxes/:name/messages/:id/read" => "inbucket_messages#mark_read"
    get "inbucket/starred/messages" => "inbucket_messages#starred"
    get "inbucket/trash/messages" => "inbucket_trash#index"
    delete "inbucket/trash" => "inbucket_trash#destroy"
    patch "inbucket/mailboxes/:name/messages/:id/trashed" => "inbucket_trash#update"
    patch "inbucket/mailboxes/:name/messages/:id/starred" => "inbucket_messages#update_starred"
    patch "inbucket/mailboxes/:name/messages/:id/tags/:tag_id" => "inbucket_message_tags#update"
    get "inbucket/mailboxes/:name/messages/:id/source" => "inbucket_messages#source"
    get "inbucket/mailboxes/:name/messages/:id/inline-image" => "inbucket_messages#inline_image"
    get "inbucket/mailboxes/:name/messages/:id/attachments" => "inbucket_messages#attachments"
    get "inbucket/mailboxes/:name/messages/:id/attachments/:index" => "inbucket_messages#attachment"
  end
end
