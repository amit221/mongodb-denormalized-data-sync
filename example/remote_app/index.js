const SynchronizerClient = process.env.NODE_ENV === 'dev' ? require('../../synchronizer_client') : require('mongodb-data-sync');
